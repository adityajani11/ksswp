const express = require("express");
const auth = require("../middleware/auth");

const {
  enqueueTemplateCampaign,
  getQueueCampaignStatus,
  getQueueCampaignHistory,
  getQueueCampaignRecipients,
  deleteQueueCampaignHistoryItem,
  clearQueueCampaignHistory,
  handleDeliveryWebhook,
  sendTextTemplateMessage,
  sendImageTemplate,
  sendVideoTemplate,
  sendDocumentTemplate,
} = require("../controllers/whatsapp.controller");

const router = express.Router();

// QUEUE CAMPAIGN
router.post("/queue/campaign", auth, enqueueTemplateCampaign);

// QUEUE STATUS
router.get("/queue/campaign/:campaignId", auth, getQueueCampaignStatus);

// QUEUE HISTORY
router.get("/queue/campaigns", auth, getQueueCampaignHistory);
router.delete("/queue/campaigns", auth, clearQueueCampaignHistory);

// QUEUE ACK LIST (SENT / UNSENT)
router.get(
  "/queue/campaign/:campaignId/recipients",
  auth,
  getQueueCampaignRecipients,
);
router.delete(
  "/queue/campaign/:campaignId",
  auth,
  deleteQueueCampaignHistoryItem,
);

// OPTIONAL DELIVERY WEBHOOK CALLBACK
router.post("/webhook/delivery", handleDeliveryWebhook);

// TEXT TEMPLATE
router.post("/template/text", auth, sendTextTemplateMessage);

// IMAGE TEMPLATE (link based)
router.post("/template/image", auth, sendImageTemplate);

// VIDEO TEMPLATE (link based)
router.post("/template/video", auth, sendVideoTemplate);

// DOCUMENT TEMPLATE (link based)
router.post("/template/document", auth, sendDocumentTemplate);

module.exports = router;
