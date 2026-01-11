const express = require("express");
const auth = require("../middleware/auth");

const {
  sendTextTemplateMessage,
  sendImageTemplate,
  sendVideoTemplate,
  sendDocumentTemplate,
} = require("../controllers/whatsapp.controller");

const router = express.Router();

// TEXT TEMPLATE
router.post("/template/text", auth, sendTextTemplateMessage);

// IMAGE TEMPLATE (link based)
// router.post("/template/image", sendImageTemplate);

// VIDEO TEMPLATE (link based)
// router.post("/template/video", sendVideoTemplate);

// DOCUMENT TEMPLATE (link based)
// router.post("/template/document", sendDocumentTemplate);

module.exports = router;
