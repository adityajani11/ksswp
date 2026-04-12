import Swal from "sweetalert2";
import api from "./api";

const FINAL_STATUSES = new Set(["completed", "completed_with_failures", "failed"]);
const POLL_MS = 1200;
const MAX_POLL_ERRORS = 8;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function calculateCampaignProgress(campaign) {
  const total = Number(campaign?.totalRecipients || 0);
  const sent = Number(campaign?.successCount || 0);
  const failed = Number(campaign?.failedCount || 0);
  const processed = Math.min(total, sent + failed);
  const pending = Math.max(0, total - processed);
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return { total, sent, failed, processed, pending, percent };
}

function progressHtml(campaign, label) {
  const { total, sent, failed, pending, percent } =
    calculateCampaignProgress(campaign);
  const safeStatus = escapeHtml(campaign?.status || "queued");
  const safeLabel = escapeHtml(label || "Campaign");

  return `
    <div style="text-align:left;">
      <p style="margin:0 0 8px 0;font-size:14px;color:#374151;">${safeLabel} is sending. Please wait.</p>
      <div style="height:12px;background:#e5e7eb;border-radius:9999px;overflow:hidden;">
        <div style="height:100%;width:${percent}%;background:#2563eb;transition:width 0.25s ease;"></div>
      </div>
      <div style="margin-top:10px;font-size:13px;color:#4b5563;line-height:1.6;">
        <div><strong>${percent}%</strong> completed (${sent + failed}/${total})</div>
        <div>Sent: <strong>${sent}</strong> | Failed: <strong>${failed}</strong> | Pending: <strong>${pending}</strong></div>
        <div>Status: <strong style="text-transform:capitalize;">${safeStatus.replaceAll("_", " ")}</strong></div>
      </div>
    </div>
  `;
}

export async function waitForCampaignCompletion({
  campaignId,
  label = "Messages",
  title = "Sending...",
}) {
  let latestCampaign = null;
  let pollErrors = 0;
  let loopDone = false;

  await Swal.fire({
    title,
    html: progressHtml(null, label),
    allowEscapeKey: false,
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: async () => {
      while (!loopDone) {
        try {
          const res = await api.get(`/whatsapp/queue/campaign/${campaignId}`);
          latestCampaign = res.data?.campaign || null;
          pollErrors = 0;

          Swal.update({
            html: progressHtml(latestCampaign, label),
          });

          if (latestCampaign && FINAL_STATUSES.has(latestCampaign.status)) {
            loopDone = true;
            break;
          }
        } catch (err) {
          pollErrors += 1;

          Swal.update({
            html: `
              <div style="text-align:left;">
                <p style="margin:0;color:#b91c1c;font-size:13px;">
                  Unable to fetch progress right now. Retrying...
                </p>
              </div>
            `,
          });

          if (pollErrors >= MAX_POLL_ERRORS) {
            loopDone = true;
            break;
          }
        }

        await sleep(POLL_MS);
      }

      Swal.close();
    },
  });

  if (!latestCampaign) {
    throw new Error("Campaign queued, but live status could not be loaded.");
  }

  return latestCampaign;
}

export async function showCampaignSummary(campaign, label = "Campaign") {
  const { total, sent, failed, pending, percent } =
    calculateCampaignProgress(campaign);
  const icon = failed > 0 || campaign?.status === "failed" ? "warning" : "success";

  await Swal.fire({
    title: `${label} Result`,
    icon,
    html: `
      <div style="text-align:left;font-size:14px;line-height:1.7;">
        <div>Total: <strong>${total}</strong></div>
        <div>Sent: <strong>${sent}</strong></div>
        <div>Unsent: <strong>${failed + pending}</strong></div>
        <div>Progress: <strong>${percent}%</strong></div>
      </div>
    `,
  });
}
