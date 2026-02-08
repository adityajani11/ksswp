const axios = require("axios");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../utils/s3"); // or wherever your S3 client is
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

    // // Extract S3 key from public URL
    // // Example link:
    // // https://kss-whatsapp-media.s3.ap-south-1.amazonaws.com/image/uuid.png
    // const s3Key = link.split(".amazonaws.com/")[1];

    // // Schedule auto-delete AFTER successful send
    // setTimeout(
    //   async () => {
    //     try {
    //       await s3.send(
    //         new DeleteObjectCommand({
    //           Bucket: process.env.AWS_S3_BUCKET,
    //           Key: s3Key,
    //         }),
    //       );
    //       console.log("Auto-deleted media:", s3Key);
    //     } catch (err) {
    //       console.error("Auto-delete failed:", err);
    //     }
    //   },
    //   5 * 60 * 100,
    // ); // 5 minutes

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
