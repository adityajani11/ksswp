const axios = require("axios");
const {
  enqueueCampaign,
  getCampaignStatus,
  listCampaigns,
  getCampaignRecipients,
  deleteCampaignHistoryItem,
  clearCampaignHistory,
  applyDeliveryWebhook,
  QueueValidationError,
} = require("../services/messageQueue.service");

/**
 * Shared WhatsApp API helper
 */
async function sendWhatsAppRequest(payload) {
  try {
    return await axios.post(process.env.WHATSAPP_API_URL, payload, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("WHATAPI ERROR:", err.response?.data || err.message);
    throw err;
  }
}

function validateCampaignBody(body) {
  const { type, text, contacts, link } = body || {};

  if (!type || !text || !Array.isArray(contacts) || !contacts.length) {
    throw new QueueValidationError(
      "`type`, `text`, and non-empty `contacts` are required",
    );
  }

  if (["image", "video", "document"].includes(type) && !link) {
    throw new QueueValidationError(
      "`link` is required for image/video/document campaigns",
    );
  }
}

function buildCampaignSummary(campaign) {
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
    _id: campaign._id,
    type: campaign.type,
    text: campaign.text,
    status: campaign.status,
    totalRecipients,
    successCount,
    failedCount,
    pendingCount,
    processedCount,
    progressPercent,
    createdAt: campaign.createdAt,
    startedAt: campaign.startedAt,
    completedAt: campaign.completedAt,
    lastError: campaign.lastError || null,
  };
}

/* =========================================================
   ENQUEUE QUEUE CAMPAIGN
   ========================================================= */
exports.enqueueTemplateCampaign = async (req, res) => {
  try {
    validateCampaignBody(req.body);

    const campaign = await enqueueCampaign({
      type: req.body.type,
      text: req.body.text,
      contacts: req.body.contacts,
      link: req.body.link,
      mediaMimeType: req.body.mediaMimeType,
      mediaFileName: req.body.mediaFileName,
      createdBy: req.user?.id || null,
    });

    res.status(202).json({
      success: true,
      campaignId: campaign._id,
      status: campaign.status,
      totalRecipients: campaign.totalRecipients,
    });
  } catch (err) {
    if (err instanceof QueueValidationError) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
        details: err.details || null,
      });
    }

    console.error("Queue enqueue error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to queue campaign",
    });
  }
};

/* =========================================================
   CAMPAIGN STATUS
   ========================================================= */
exports.getQueueCampaignStatus = async (req, res) => {
  try {
    const campaign = await getCampaignStatus(req.params.campaignId, {
      createdBy: req.user?.id || null,
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      campaign: buildCampaignSummary(campaign),
    });
  } catch (err) {
    console.error("Queue status error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaign status",
    });
  }
};

/* =========================================================
   CAMPAIGN HISTORY
   ========================================================= */
exports.getQueueCampaignHistory = async (req, res) => {
  try {
    const history = await listCampaigns({
      page: req.query.page,
      limit: req.query.limit,
      createdBy: req.user?.id || null,
    });

    return res.json({
      success: true,
      ...history,
      items: history.items.map(buildCampaignSummary),
    });
  } catch (err) {
    console.error("Queue history error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaign history",
    });
  }
};

/* =========================================================
   CAMPAIGN RECIPIENT ACK LIST
   ========================================================= */
exports.getQueueCampaignRecipients = async (req, res) => {
  try {
    const data = await getCampaignRecipients(req.params.campaignId, {
      createdBy: req.user?.id || null,
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      campaign: buildCampaignSummary(data.campaign),
      delivery: {
        deliveredCount: data.campaign.deliveredCount || 0,
        readCount: data.campaign.readCount || 0,
      },
      sentRecipients: data.sentRecipients,
      unsentRecipients: data.unsentRecipients,
    });
  } catch (err) {
    console.error("Queue recipients error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaign recipients",
    });
  }
};

/* =========================================================
   DELETE SINGLE CAMPAIGN HISTORY
   ========================================================= */
exports.deleteQueueCampaignHistoryItem = async (req, res) => {
  try {
    const result = await deleteCampaignHistoryItem(req.params.campaignId, {
      createdBy: req.user?.id || null,
    });

    if (result.notFound) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    if (err instanceof QueueValidationError) {
      return res.status(err.statusCode || 400).json({
        success: false,
        message: err.message,
      });
    }

    console.error("Delete campaign history error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete campaign history",
    });
  }
};

/* =========================================================
   CLEAR PREVIOUS HISTORY
   ========================================================= */
exports.clearQueueCampaignHistory = async (req, res) => {
  try {
    const result = await clearCampaignHistory({
      createdBy: req.user?.id || null,
    });

    return res.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("Clear campaign history error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to clear campaign history",
    });
  }
};

/* =========================================================
   DELIVERY WEBHOOK (OPTIONAL)
   ========================================================= */
exports.handleDeliveryWebhook = async (req, res) => {
  try {
    const result = await applyDeliveryWebhook(req.body);
    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to process webhook",
    });
  }
};

/* =========================================================
   SEND TEXT MESSAGE (TEMPLATE)
   ========================================================= */
exports.sendTextTemplateMessage = async (req, res) => {
  try {
    const { to, text } = req.body;

    if (!to || !text) {
      return res.status(400).json({ message: "`to` and `text` are required" });
    }

    const response = await sendWhatsAppRequest({
      to,
      recipient_type: "individual",
      type: "template",
      template: {
        name: "util_txt_msg",
        language: {
          policy: "deterministic",
          code: "en",
        },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: text,
              },
            ],
          },
        ],
      },
    });

    res.json({ success: true, type: "template-text", data: response.data });
  } catch (err) {
    console.error("Template Text Error:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to send template message" });
  }
};
/* =========================================================
   SEND IMAGE TEMPLATE (LINK BASED)
   ========================================================= */
exports.sendImageTemplate = async (req, res) => {
  try {
    const { to, link, text } = req.body;

    if (!to || !link || !text) {
      return res.status(400).json({
        message: "`to`, `link`, and `text` are required",
      });
    }

    await sendWhatsAppRequest({
      to,
      recipient_type: "individual",
      type: "template",
      template: {
        name: "util_pv_msg",
        language: {
          policy: "deterministic",
          code: "en",
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: {
                  link: link,
                },
              },
            ],
          },
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: text,
              },
            ],
          },
        ],
      },
    });

    res.json({ success: true, type: "image-template" });
  } catch (err) {
    console.error("Image Template Error:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to send image template" });
  }
};

/* =========================================================
   SEND VIDEO TEMPLATE (LINK BASED)
   ========================================================= */
exports.sendVideoTemplate = async (req, res) => {
  try {
    const { to, link, text } = req.body;

    if (!to || !link || !text) {
      return res.status(400).json({
        message: "`to`, `link`, and `text` are required",
      });
    }

    await sendWhatsAppRequest({
      to,
      recipient_type: "individual",
      type: "template",
      template: {
        name: "util_video_msg",
        language: {
          policy: "deterministic",
          code: "en",
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "video",
                video: {
                  link: link,
                },
              },
            ],
          },
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: text,
              },
            ],
          },
        ],
      },
    });

    res.json({ success: true, type: "video-template" });
  } catch (err) {
    const metaError = err.response?.data?.error;

    console.error("Video template error:", metaError || err.message);

    return res.status(500).json({
      message: "Failed to send video message",
      meta: metaError
        ? {
            code: metaError.code,
            type: metaError.type,
            message: metaError.message,
          }
        : null,
    });
  }
};

/*************************************************
 SEND DOCUMENT TEMPLATE (LINK BASED)
*************************************************/
exports.sendDocumentTemplate = async (req, res) => {
  try {
    const { to, link, text } = req.body;

    if (!to || !link || !text) {
      return res.status(400).json({
        message: "`to`, `link` and `text` are required",
      });
    }

    const response = await sendWhatsAppRequest({
      to,
      recipient_type: "individual",
      type: "template",
      template: {
        name: "util_document_msg",
        language: {
          policy: "deterministic",
          code: "en",
        },
        components: [
          {
            type: "header",
            parameters: [
              {
                type: "document",
                document: {
                  link: link,
                },
              },
            ],
          },
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: text,
              },
            ],
          },
        ],
      },
    });

    const isSent =
      response?.data?.messages && response.data.messages.length > 0;

    res.json({
      success: isSent,
      type: "document-template",
      waResponse: response.data,
    });
  } catch (err) {
    console.error(
      "Document Template Error:",
      err.response?.data || err.message,
    );

    res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || "Send failed",
    });
  }
};
