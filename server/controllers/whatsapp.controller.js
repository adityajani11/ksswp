const axios = require("axios");

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
        name: "video_message",
        language: {
          policy: "deterministic",
          code: "en_GB",
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
    console.error("Video Template Error:", err.response?.data || err.message);
    res.status(500).json({ message: "Failed to send video template" });
  }
};

/* =========================================================
   SEND DOCUMENT TEMPLATE (LINK BASED)
   ========================================================= */
exports.sendDocumentTemplate = async (req, res) => {
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
        name: "document_message",
        language: {
          policy: "deterministic",
          code: "en_GB",
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

    res.json({ success: true, type: "document-template" });
  } catch (err) {
    console.error(
      "Document Template Error:",
      err.response?.data || err.message
    );
    res.status(500).json({ message: "Failed to send document template" });
  }
};
