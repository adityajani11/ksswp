const axios = require("axios");
const MessageCampaign = require("../models/MessageCampaign");

const WORKER_ID = `${process.pid}-${Math.random().toString(16).slice(2, 10)}`;

const POLL_INTERVAL_MS = Number(process.env.WHATSAPP_QUEUE_POLL_MS || 1000);
const LOCK_TIMEOUT_MS = Number(process.env.WHATSAPP_QUEUE_LOCK_MS || 120000);
const LOCK_HEARTBEAT_MS = Math.max(
  1000,
  Math.min(
    Math.floor(LOCK_TIMEOUT_MS / 2),
    Number(process.env.WHATSAPP_QUEUE_LOCK_HEARTBEAT_MS || 30000) || 30000,
  ),
);
const RETRY_BASE_DELAY_MS = Number(
  process.env.WHATSAPP_QUEUE_RETRY_BASE_MS || 4000,
);
const RETRY_MAX_DELAY_MS = Number(
  process.env.WHATSAPP_QUEUE_RETRY_MAX_MS || 90000,
);
const RETRY_JITTER_MS = Number(process.env.WHATSAPP_QUEUE_RETRY_JITTER_MS || 500);
const INTER_MESSAGE_DELAY_MS = Number(
  process.env.WHATSAPP_QUEUE_SEND_GAP_MS || 200,
);
const REQUEST_TIMEOUT_MS = Number(
  process.env.WHATSAPP_REQUEST_TIMEOUT_MS || 20000,
);
const MAX_RECIPIENTS_PER_CAMPAIGN = Math.max(
  1,
  Number(process.env.WHATSAPP_MAX_RECIPIENTS || 10000) || 10000,
);
const MEDIA_MODE = String(process.env.WHATSAPP_MEDIA_MODE || "auto")
  .trim()
  .toLowerCase();

const RETRYABLE_HTTP_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_PROVIDER_CODES = new Set([2, 4, 131000, 131016, 131047, 131056]);
const FINAL_CAMPAIGN_STATUSES = new Set([
  "completed",
  "completed_with_failures",
  "failed",
]);

let workerTimer = null;
let workerBusy = false;

class QueueValidationError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = "QueueValidationError";
    this.statusCode = 400;
    this.details = details;
  }
}

class QueuePauseError extends Error {
  constructor(message) {
    super(message);
    this.name = "QueuePauseError";
  }
}

class QueueTerminalError extends Error {
  constructor(message) {
    super(message);
    this.name = "QueueTerminalError";
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hasMedia(type) {
  return type === "image" || type === "video" || type === "document";
}

function shouldForceLinkMode() {
  return MEDIA_MODE === "link";
}

function shouldForceMediaIdMode() {
  return MEDIA_MODE === "id";
}

function normalizeContacts(contacts) {
  const map = new Map();
  for (const item of contacts || []) {
    let to = "";
    let name = "";

    if (typeof item === "string" || typeof item === "number") {
      to = String(item).trim();
    } else if (item && typeof item === "object") {
      to = String(item.to || item.phone || "").trim();
      name = String(item.name || "").trim();
    }

    if (!to) continue;

    const existing = map.get(to);
    if (!existing) {
      map.set(to, { to, name });
      continue;
    }

    if (!existing.name && name) {
      existing.name = name;
    }
  }

  return [...map.values()];
}

function validateContacts(contacts) {
  const invalid = contacts
    .map((item) => item?.to)
    .filter((to) => !/^\d{10,15}$/.test(String(to || "")));
  if (invalid.length) {
    throw new QueueValidationError("Some contacts are invalid", { invalid });
  }

  const invalidNames = contacts
    .map((item) => item?.name || "")
    .filter((name) => String(name).trim().length > 200);

  if (invalidNames.length) {
    throw new QueueValidationError("Some contact names are too long");
  }
}

function buildTemplateName(type) {
  switch (type) {
    case "text":
      return "util_txt_msg";
    case "image":
      return "util_pv_msg";
    case "video":
      return "util_video_msg";
    case "document":
      return "util_document_msg";
    default:
      throw new QueueValidationError("Unsupported campaign type");
  }
}

function buildMessagePayload(campaign, to) {
  const template = {
    name: buildTemplateName(campaign.type),
    language: {
      policy: "deterministic",
      code: "en",
    },
    components: [],
  };

  if (hasMedia(campaign.type)) {
    const useLink = Boolean(campaign.useMediaLink) || !campaign.mediaId;
    const mediaPayload = useLink
      ? { link: campaign.link }
      : { id: campaign.mediaId };

    template.components.push({
      type: "header",
      parameters: [
        {
          type: campaign.type,
          [campaign.type]: mediaPayload,
        },
      ],
    });
  }

  template.components.push({
    type: "body",
    parameters: [
      {
        type: "text",
        text: campaign.text,
      },
    ],
  });

  return {
    to,
    recipient_type: "individual",
    type: "template",
    template,
  };
}

function isUnsupportedMediaUploadEndpoint(err) {
  const status = Number(err?.response?.status || 0);
  if (status === 404 || status === 405 || status === 501) return true;

  const text = `${toErrorText(err)}`.toLowerCase();
  return text.includes("not found") || text.includes("endpoint");
}

function toErrorText(err) {
  const providerMessage = err.response?.data?.error?.message;
  if (providerMessage) return providerMessage;
  const directMessage = err.response?.data?.message || err.response?.data?.msg;
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage.trim();
  }
  if (typeof err.message === "string") return err.message;
  return "Unknown error";
}

function extractMessageIdFromResponse(data) {
  const candidates = [
    data?.messages?.[0]?.id,
    data?.message_id,
    data?.messageId,
    data?.id,
    data?.data?.message_id,
    data?.data?.messageId,
    data?.data?.id,
    data?.result?.message_id,
    data?.result?.messageId,
    data?.result?.id,
  ];

  for (const value of candidates) {
    if (value === undefined || value === null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }

  return null;
}

function providerResponseLooksFailure(data) {
  if (!data || typeof data !== "object") return false;

  if (data.error) return true;
  if (typeof data.success === "boolean" && data.success === false) return true;

  const status = String(data.status || data.state || "").toLowerCase();
  if (
    status &&
    (status.includes("fail") ||
      status.includes("error") ||
      status.includes("reject") ||
      status.includes("invalid"))
  ) {
    return true;
  }

  const message = String(data.message || data.msg || "").toLowerCase();
  if (
    message &&
    (message.includes("failed") ||
      message.includes("error") ||
      message.includes("rejected") ||
      message.includes("invalid"))
  ) {
    return true;
  }

  const code = Number(data.code);
  if (!Number.isNaN(code) && code >= 400) return true;

  return false;
}

function isProviderSendAccepted(response) {
  const statusCode = Number(response?.status || 0);
  if (statusCode < 200 || statusCode >= 300) return false;

  const data = response?.data;
  if (!data) return true;
  if (providerResponseLooksFailure(data)) return false;

  const positiveStatus = String(data.status || data.state || "").toLowerCase();
  if (
    positiveStatus &&
    (positiveStatus.includes("success") ||
      positiveStatus.includes("sent") ||
      positiveStatus.includes("accepted") ||
      positiveStatus.includes("queued") ||
      positiveStatus === "ok")
  ) {
    return true;
  }

  if (typeof data.success === "boolean") return data.success;
  if (Array.isArray(data.messages) && data.messages.length > 0) return true;
  if (extractMessageIdFromResponse(data)) return true;

  // Default: 2xx without explicit failure is considered accepted.
  return true;
}

function providerRejectReason(response) {
  const data = response?.data || {};
  return (
    data?.error?.message ||
    data?.message ||
    data?.msg ||
    "Provider rejected message"
  );
}

function isRetriableError(err) {
  if (!err.response) return true;

  const status = err.response.status;
  if (RETRYABLE_HTTP_STATUS.has(status)) return true;

  const code = err.response?.data?.error?.code;
  if (typeof code === "number" && RETRYABLE_PROVIDER_CODES.has(code)) {
    return true;
  }

  const text = `${toErrorText(err)}`.toLowerCase();
  return (
    text.includes("timeout") ||
    text.includes("temporar") ||
    text.includes("rate limit") ||
    text.includes("try again")
  );
}

function backoffDelay(attemptNumber) {
  const base = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attemptNumber - 1);
  const capped = Math.min(base, RETRY_MAX_DELAY_MS);
  const jitter = Math.floor(Math.random() * Math.max(0, RETRY_JITTER_MS));
  return capped + jitter;
}

function minDate(current, incoming) {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming < current ? incoming : current;
}

function unlockCampaign(campaign) {
  campaign.lockId = null;
  campaign.lockedAt = null;
}

function touchCampaignLock(campaign) {
  campaign.lockId = WORKER_ID;
  campaign.lockedAt = new Date();
}

function syncCampaignCounters(campaign) {
  let successCount = 0;
  let failedCount = 0;

  for (const recipient of campaign.recipients || []) {
    if (recipient.status === "sent") {
      successCount += 1;
      continue;
    }

    if (recipient.status === "failed") {
      failedCount += 1;
    }
  }

  campaign.successCount = successCount;
  campaign.failedCount = failedCount;

  return { successCount, failedCount };
}

function calculateProgressSummary(campaign) {
  const totalRecipients = Number(campaign.totalRecipients || 0);
  const successCount = Number(campaign.successCount || 0);
  const failedCount = Number(campaign.failedCount || 0);
  const pendingCount = Math.max(0, totalRecipients - successCount - failedCount);
  const processedCount = successCount + failedCount;
  const progressPercent =
    totalRecipients > 0
      ? Math.min(100, Math.round((processedCount / totalRecipients) * 100))
      : 0;

  return {
    totalRecipients,
    successCount,
    failedCount,
    pendingCount,
    processedCount,
    progressPercent,
  };
}

function mapWebhookDeliveryStatus(status) {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();

  if (!normalized) return "pending";
  if (normalized === "read") return "read";
  if (normalized === "delivered") return "delivered";
  if (normalized === "sent") return "sent";
  if (
    normalized === "failed" ||
    normalized === "undelivered" ||
    normalized === "delivery_failed"
  ) {
    return "failed";
  }

  return "pending";
}

function deriveMediaUploadUrl() {
  if (process.env.WHATSAPP_MEDIA_UPLOAD_URL) {
    return process.env.WHATSAPP_MEDIA_UPLOAD_URL;
  }

  const apiUrl = process.env.WHATSAPP_API_URL || "";

  if (apiUrl.includes("/messages")) {
    return apiUrl.replace(/\/messages(\?.*)?$/i, "/media");
  }

  throw new Error(
    "WHATSAPP_MEDIA_UPLOAD_URL is missing and cannot be derived from WHATSAPP_API_URL",
  );
}

function fileNameFromUrl(link, fallbackPrefix, mimeType) {
  try {
    const parsed = new URL(link);
    const maybeName = parsed.pathname.split("/").pop();
    if (maybeName && maybeName.includes(".")) return maybeName;
  } catch {
    // Ignore parsing issues and fallback.
  }

  const typeExtMap = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  };

  const ext = typeExtMap[mimeType] || "bin";
  return `${fallbackPrefix}.${ext}`;
}

async function uploadMediaToWhatsApp({ link, mimeType, fileName, type }) {
  if (!link) {
    throw new Error("Media link is required for media upload");
  }

  const token = process.env.WHATSAPP_TOKEN;
  if (!token) {
    throw new Error("WHATSAPP_TOKEN is not configured");
  }

  const mediaUploadUrl = deriveMediaUploadUrl();

  const mediaFetchOptions = {};
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    mediaFetchOptions.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }

  const mediaRes = await fetch(link, mediaFetchOptions);
  if (!mediaRes.ok) {
    throw new Error(`Could not download media from link (${mediaRes.status})`);
  }

  const detectedMimeType =
    mimeType ||
    mediaRes.headers.get("content-type") ||
    "application/octet-stream";
  const detectedFileName =
    fileName || fileNameFromUrl(link, `${type}-${Date.now()}`, detectedMimeType);

  const bytes = await mediaRes.arrayBuffer();
  const blob = new Blob([bytes], { type: detectedMimeType });
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", blob, detectedFileName);

  const uploadFetchOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  };

  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    uploadFetchOptions.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  }

  const uploadRes = await fetch(mediaUploadUrl, uploadFetchOptions);

  let uploadData = null;
  try {
    uploadData = await uploadRes.json();
  } catch {
    // Ignore non-JSON responses.
  }

  if (!uploadRes.ok || !uploadData?.id) {
    const providerMessage =
      uploadData?.error?.message || `Media upload failed (${uploadRes.status})`;
    const error = new Error(providerMessage);
    error.response = {
      status: uploadRes.status,
      data: uploadData,
    };
    throw error;
  }

  return uploadData.id;
}

async function sendWhatsAppMessage(payload) {
  return axios.post(process.env.WHATSAPP_API_URL, payload, {
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    timeout: REQUEST_TIMEOUT_MS,
  });
}

function markUnresolvedRecipientsFailed(campaign, reason) {
  for (const recipient of campaign.recipients) {
    if (recipient.status === "sent" || recipient.status === "failed") continue;
    recipient.status = "failed";
    recipient.lastError = reason;
    recipient.deliveryStatus = "failed";
    recipient.statusUpdatedAt = new Date();
  }
}

async function finalizeCampaign(campaign, pendingNextRunAt = null) {
  campaign.successCount = campaign.recipients.filter(
    (r) => r.status === "sent",
  ).length;
  campaign.failedCount = campaign.recipients.filter(
    (r) => r.status === "failed",
  ).length;

  const pendingCount =
    campaign.totalRecipients - campaign.successCount - campaign.failedCount;

  if (pendingCount <= 0) {
    if (campaign.successCount === 0 && campaign.failedCount > 0) {
      campaign.status = "failed";
    } else if (campaign.failedCount > 0) {
      campaign.status = "completed_with_failures";
    } else {
      campaign.status = "completed";
    }

    campaign.completedAt = new Date();
    campaign.nextRunAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  } else {
    campaign.status = "queued";
    campaign.completedAt = null;
    campaign.nextRunAt = pendingNextRunAt || new Date(Date.now() + POLL_INTERVAL_MS);
  }

  unlockCampaign(campaign);
  await campaign.save();
}

async function ensureCampaignMediaId(campaign) {
  if (!hasMedia(campaign.type)) return;

  if (campaign.useMediaLink || shouldForceLinkMode()) {
    if (!campaign.useMediaLink) {
      campaign.useMediaLink = true;
      campaign.lastError = null;
      await campaign.save();
    }
    return;
  }

  if (campaign.mediaId) return;

  campaign.mediaUploadAttempts += 1;
  await campaign.save();

  try {
    campaign.mediaId = await uploadMediaToWhatsApp({
      link: campaign.link,
      mimeType: campaign.mediaMimeType,
      fileName: campaign.mediaFileName,
      type: campaign.type,
    });
    campaign.lastError = null;
    await campaign.save();
  } catch (err) {
    if (!shouldForceMediaIdMode() && isUnsupportedMediaUploadEndpoint(err)) {
      campaign.useMediaLink = true;
      campaign.lastError = null;
      await campaign.save();
      console.warn(
        "[queue] Media upload endpoint unavailable, falling back to link mode",
      );
      return;
    }

    const reason = `Media upload failed: ${toErrorText(err)}`;
    const canRetry =
      isRetriableError(err) && campaign.mediaUploadAttempts < campaign.maxAttempts;

    campaign.lastError = reason;

    if (canRetry) {
      campaign.status = "queued";
      campaign.nextRunAt = new Date(
        Date.now() + backoffDelay(campaign.mediaUploadAttempts),
      );
      unlockCampaign(campaign);
      await campaign.save();
      throw new QueuePauseError(reason);
    }

    markUnresolvedRecipientsFailed(campaign, reason);
    campaign.status = "failed";
    campaign.completedAt = new Date();
    unlockCampaign(campaign);
    await campaign.save();
    throw new QueueTerminalError(reason);
  }
}

async function processCampaign(campaign) {
  try {
    await ensureCampaignMediaId(campaign);
  } catch (err) {
    if (err instanceof QueuePauseError || err instanceof QueueTerminalError) {
      return;
    }
    throw err;
  }

  if (!campaign.startedAt) {
    campaign.startedAt = new Date();
  }

  const counters = syncCampaignCounters(campaign);
  let successCount = counters.successCount;
  let failedCount = counters.failedCount;
  let lastHeartbeatAt = 0;
  let nextRunAt = null;

  for (const recipient of campaign.recipients) {
    if (recipient.status === "sent" || recipient.status === "failed") {
      continue;
    }

    const dueAt = recipient.nextAttemptAt || new Date(0);
    if (dueAt > new Date()) {
      nextRunAt = minDate(nextRunAt, dueAt);
      continue;
    }

    const previousStatus = recipient.status;
    recipient.attempts += 1;
    recipient.lastTriedAt = new Date();
    recipient.lastError = null;

    if (Date.now() - lastHeartbeatAt >= LOCK_HEARTBEAT_MS) {
      touchCampaignLock(campaign);
      lastHeartbeatAt = Date.now();
    }

    await campaign.save();

    try {
      const payload = buildMessagePayload(campaign, recipient.to);
      const response = await sendWhatsAppMessage(payload);
      const providerAccepted = isProviderSendAccepted(response);

      if (!providerAccepted) {
        const error = new Error(providerRejectReason(response));
        error.response = {
          status: response?.status || 502,
          data: response?.data || null,
        };
        throw error;
      }

      const messageId = extractMessageIdFromResponse(response?.data);
      recipient.status = "sent";
      recipient.sentAt = new Date();
      recipient.messageId = messageId || null;
      recipient.nextAttemptAt = null;
      recipient.lastError = null;
      recipient.deliveryStatus = "sent";
      recipient.statusUpdatedAt = new Date();
    } catch (err) {
      const reason = toErrorText(err);
      const shouldRetry =
        isRetriableError(err) && recipient.attempts < campaign.maxAttempts;

      if (shouldRetry) {
        recipient.status = "queued";
        recipient.lastError = reason;
        recipient.deliveryStatus = "pending";
        recipient.nextAttemptAt = new Date(
          Date.now() + backoffDelay(recipient.attempts),
        );
        recipient.statusUpdatedAt = new Date();
        nextRunAt = minDate(nextRunAt, recipient.nextAttemptAt);
      } else {
        recipient.status = "failed";
        recipient.lastError = reason;
        recipient.nextAttemptAt = null;
        recipient.deliveryStatus = "failed";
        recipient.statusUpdatedAt = new Date();
      }
    }

    if (previousStatus !== recipient.status) {
      if (previousStatus === "sent") successCount = Math.max(0, successCount - 1);
      if (previousStatus === "failed") failedCount = Math.max(0, failedCount - 1);
      if (recipient.status === "sent") successCount += 1;
      if (recipient.status === "failed") failedCount += 1;
    }

    campaign.successCount = successCount;
    campaign.failedCount = failedCount;

    if (Date.now() - lastHeartbeatAt >= LOCK_HEARTBEAT_MS) {
      touchCampaignLock(campaign);
      lastHeartbeatAt = Date.now();
    }

    await campaign.save();

    if (INTER_MESSAGE_DELAY_MS > 0) {
      await sleep(INTER_MESSAGE_DELAY_MS);
    }
  }

  await finalizeCampaign(campaign, nextRunAt);
}

async function reconcileLegacyAcklessFailures() {
  const matcher = /Provider did not return message id/i;
  const campaigns = await MessageCampaign.find({
    recipients: {
      $elemMatch: {
        status: "failed",
        lastError: { $regex: matcher },
      },
    },
  });

  let affected = 0;

  for (const campaign of campaigns) {
    let changed = false;

    for (const recipient of campaign.recipients) {
      const isLegacyMismatch =
        recipient.status === "failed" && matcher.test(recipient.lastError || "");

      if (!isLegacyMismatch) continue;

      recipient.status = "sent";
      recipient.sentAt = recipient.sentAt || recipient.lastTriedAt || new Date();
      recipient.lastError = null;
      recipient.nextAttemptAt = null;
      recipient.deliveryStatus = "sent";
      recipient.statusUpdatedAt = new Date();
      changed = true;
    }

    if (!changed) continue;

    campaign.lastError = null;
    await finalizeCampaign(campaign);
    affected += 1;
  }

  if (affected > 0) {
    console.log(
      `[queue] Reconciled ${affected} campaign(s) with legacy missing-message-id failures`,
    );
  }
}

async function recoverStaleLocks() {
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);

  await MessageCampaign.updateMany(
    {
      status: "processing",
      lockedAt: { $lt: staleBefore },
      updatedAt: { $lt: staleBefore },
    },
    {
      $set: {
        status: "queued",
        lockId: null,
        nextRunAt: new Date(),
        lastError: "Recovered stale queue lock",
      },
      $unset: { lockedAt: "" },
    },
  );
}

async function runWorkerTick() {
  if (workerBusy) return;
  workerBusy = true;

  try {
    await recoverStaleLocks();

    const now = new Date();
    const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);

    const campaign = await MessageCampaign.findOneAndUpdate(
      {
        status: { $in: ["queued", "processing"] },
        nextRunAt: { $lte: now },
        $or: [
          { lockId: { $exists: false } },
          { lockId: null },
          {
            lockedAt: { $lt: staleBefore },
            updatedAt: { $lt: staleBefore },
          },
        ],
      },
      {
        $set: {
          status: "processing",
          lockId: WORKER_ID,
          lockedAt: now,
        },
      },
      {
        sort: { nextRunAt: 1, createdAt: 1 },
        new: true,
      },
    );

    if (!campaign) return;

    await processCampaign(campaign);
  } catch (err) {
    console.error("[queue] Worker tick failed:", err);
  } finally {
    workerBusy = false;
  }
}

async function enqueueCampaign({
  type,
  text,
  contacts,
  link = null,
  mediaMimeType = null,
  mediaFileName = null,
  createdBy = null,
}) {
  const safeType = String(type || "").trim();
  const safeText = String(text || "").trim();

  if (!safeType || !safeText) {
    throw new QueueValidationError("`type`, `text` and `contacts` are required");
  }

  if (!["text", "image", "video", "document"].includes(safeType)) {
    throw new QueueValidationError("Unsupported campaign type");
  }

  const normalizedContacts = normalizeContacts(contacts);
  if (!normalizedContacts.length) {
    throw new QueueValidationError("At least one recipient is required");
  }

  if (normalizedContacts.length > MAX_RECIPIENTS_PER_CAMPAIGN) {
    throw new QueueValidationError(
      `Recipient limit exceeded. Max allowed is ${MAX_RECIPIENTS_PER_CAMPAIGN}.`,
    );
  }

  validateContacts(normalizedContacts);

  if (hasMedia(safeType) && !link) {
    throw new QueueValidationError("Media link is required for media campaign");
  }

  const recipients = normalizedContacts.map((to) => ({
    to: to.to,
    name: to.name || "",
    status: "queued",
    attempts: 0,
    nextAttemptAt: new Date(),
  }));

  const campaign = await MessageCampaign.create({
    type: safeType,
    text: safeText,
    link: hasMedia(safeType) ? String(link || "").trim() : null,
    mediaMimeType: mediaMimeType || null,
    mediaFileName: mediaFileName || null,
    recipients,
    totalRecipients: recipients.length,
    status: "queued",
    nextRunAt: new Date(),
    createdBy,
  });

  return campaign;
}

async function getCampaignStatus(campaignId, { createdBy = null } = {}) {
  const query = { _id: campaignId };
  if (createdBy) {
    query.createdBy = createdBy;
  }

  const campaign = await MessageCampaign.findOne(query).lean();
  if (!campaign) return null;

  return {
    ...campaign,
    ...calculateProgressSummary(campaign),
  };
}

async function listCampaigns({
  page = 1,
  limit = 20,
  createdBy = null,
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const query = {};
  if (createdBy) {
    query.createdBy = createdBy;
  }

  const [campaigns, total] = await Promise.all([
    MessageCampaign.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .select(
        "_id type text status totalRecipients successCount failedCount createdAt startedAt completedAt lastError",
      )
      .lean(),
    MessageCampaign.countDocuments(query),
  ]);

  const items = campaigns.map((campaign) => ({
    ...campaign,
    ...calculateProgressSummary(campaign),
  }));

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

async function getCampaignRecipients(campaignId, { createdBy = null } = {}) {
  const query = { _id: campaignId };
  if (createdBy) {
    query.createdBy = createdBy;
  }

  const campaign = await MessageCampaign.findOne(query)
    .select(
      "_id type text status totalRecipients successCount failedCount createdAt startedAt completedAt lastError recipients",
    )
    .lean();

  if (!campaign) return null;

  const recipients = Array.isArray(campaign.recipients) ? campaign.recipients : [];

  const sortedSent = recipients
    .filter((r) => r.status === "sent")
    .sort(
      (a, b) =>
        new Date(b.sentAt || b.statusUpdatedAt || 0).getTime() -
        new Date(a.sentAt || a.statusUpdatedAt || 0).getTime(),
    );

  const sortedUnsent = recipients
    .filter((r) => r.status !== "sent")
    .sort(
      (a, b) =>
        new Date(b.lastTriedAt || b.nextAttemptAt || 0).getTime() -
        new Date(a.lastTriedAt || a.nextAttemptAt || 0).getTime(),
    );

  const deliveredCount = recipients.filter(
    (r) => r.deliveryStatus === "delivered" || r.deliveryStatus === "read",
  ).length;
  const readCount = recipients.filter((r) => r.deliveryStatus === "read").length;

  return {
    campaign: {
      ...campaign,
      ...calculateProgressSummary(campaign),
      deliveredCount,
      readCount,
    },
    sentRecipients: sortedSent,
    unsentRecipients: sortedUnsent,
  };
}

async function deleteCampaignHistoryItem(
  campaignId,
  { createdBy = null, allowActive = false } = {},
) {
  const query = { _id: campaignId };
  if (createdBy) {
    query.createdBy = createdBy;
  }

  const campaign = await MessageCampaign.findOne(query)
    .select("_id status")
    .lean();

  if (!campaign) {
    return { deletedCount: 0, notFound: true };
  }

  if (!allowActive && !FINAL_CAMPAIGN_STATUSES.has(campaign.status)) {
    throw new QueueValidationError(
      "Only completed/failed campaign history can be deleted",
    );
  }

  const result = await MessageCampaign.deleteOne(query);
  return {
    deletedCount: result.deletedCount || 0,
    notFound: false,
  };
}

async function clearCampaignHistory({ createdBy = null } = {}) {
  const query = {
    status: { $in: [...FINAL_CAMPAIGN_STATUSES] },
  };

  if (createdBy) {
    query.createdBy = createdBy;
  }

  const result = await MessageCampaign.deleteMany(query);
  return {
    deletedCount: result.deletedCount || 0,
  };
}

function extractWebhookStatuses(payload) {
  const events = [];
  const raw = payload || {};

  const pushStatus = (statusObj) => {
    const messageId =
      statusObj?.id ||
      statusObj?.message_id ||
      statusObj?.messageId ||
      statusObj?.wamid;

    if (!messageId) return;

    events.push({
      messageId,
      status: statusObj?.status || statusObj?.state || null,
      timestamp: statusObj?.timestamp || statusObj?.time || null,
      error:
        statusObj?.errors?.[0]?.title ||
        statusObj?.errors?.[0]?.message ||
        statusObj?.error?.message ||
        null,
    });
  };

  if (Array.isArray(raw.statuses)) {
    raw.statuses.forEach(pushStatus);
  }

  const entries = Array.isArray(raw.entry) ? raw.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const statuses = Array.isArray(change?.value?.statuses)
        ? change.value.statuses
        : [];
      statuses.forEach(pushStatus);
    }
  }

  return events;
}

async function applyDeliveryWebhook(payload) {
  const events = extractWebhookStatuses(payload);
  let updated = 0;

  for (const event of events) {
    const deliveryStatus = mapWebhookDeliveryStatus(event.status);
    const now = new Date();
    const statusDate =
      event.timestamp && !Number.isNaN(Number(event.timestamp))
        ? new Date(Number(event.timestamp) * 1000)
        : now;

    const setFields = {
      "recipients.$.deliveryStatus": deliveryStatus,
      "recipients.$.statusUpdatedAt": statusDate,
    };

    if (deliveryStatus === "delivered") {
      setFields["recipients.$.deliveredAt"] = statusDate;
    }

    if (deliveryStatus === "read") {
      setFields["recipients.$.deliveredAt"] = statusDate;
      setFields["recipients.$.readAt"] = statusDate;
    }

    if (deliveryStatus === "failed") {
      setFields["recipients.$.status"] = "failed";
      setFields["recipients.$.nextAttemptAt"] = null;
      if (event.error) {
        setFields["recipients.$.lastError"] = event.error;
      }
    }

    const result = await MessageCampaign.updateOne(
      {
        "recipients.messageId": event.messageId,
      },
      {
        $set: setFields,
      },
    );

    if (result.matchedCount > 0) {
      updated += 1;

      if (deliveryStatus === "failed") {
        const campaign = await MessageCampaign.findOne({
          "recipients.messageId": event.messageId,
        });

        if (campaign && !FINAL_CAMPAIGN_STATUSES.has(campaign.status)) {
          syncCampaignCounters(campaign);
          if (event.error) {
            campaign.lastError = event.error;
          }

          const pendingCount = Math.max(
            0,
            Number(campaign.totalRecipients || 0) -
              Number(campaign.successCount || 0) -
              Number(campaign.failedCount || 0),
          );

          if (pendingCount <= 0 && campaign.status !== "processing") {
            await finalizeCampaign(campaign);
          } else {
            const setFields = {
              successCount: campaign.successCount,
              failedCount: campaign.failedCount,
            };

            if (event.error) {
              setFields.lastError = event.error;
            }

            await MessageCampaign.updateOne(
              { _id: campaign._id },
              { $set: setFields },
            );
          }
        }
      }
    }
  }

  return {
    received: events.length,
    updated,
  };
}

function startQueueWorker() {
  if (workerTimer) return;

  void reconcileLegacyAcklessFailures().catch((err) => {
    console.error("[queue] Legacy reconciliation failed:", err.message);
  });

  workerTimer = setInterval(() => {
    void runWorkerTick();
  }, POLL_INTERVAL_MS);

  if (typeof workerTimer.unref === "function") {
    workerTimer.unref();
  }

  console.log(`[queue] Worker started (${WORKER_ID})`);
}

function stopQueueWorker() {
  if (!workerTimer) return;
  clearInterval(workerTimer);
  workerTimer = null;
}

module.exports = {
  QueueValidationError,
  enqueueCampaign,
  getCampaignStatus,
  listCampaigns,
  getCampaignRecipients,
  deleteCampaignHistoryItem,
  clearCampaignHistory,
  applyDeliveryWebhook,
  calculateProgressSummary,
  startQueueWorker,
  stopQueueWorker,
};
