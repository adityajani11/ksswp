const { v4: uuidv4 } = require("uuid");
const { getSignedUploadUrl } = require("../utils/s3");

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

exports.createSignedUpload = async (req, res) => {
  try {
    const { fileName, contentType, category } = req.body;

    if (!fileName || !contentType || !category) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    const typeMap = {
      image: IMAGE_TYPES,
      video: VIDEO_TYPES,
      document: DOC_TYPES,
    };

    if (!typeMap[category]?.includes(contentType)) {
      return res.status(400).json({ message: "File type not allowed" });
    }

    const ext = fileName.split(".").pop();
    const key = `${category}/${uuidv4()}.${ext}`;

    const uploadUrl = await getSignedUploadUrl({
      key,
      contentType,
    });

    const publicUrl = `${process.env.AWS_S3_PUBLIC_BASE}/${key}`;

    res.json({
      uploadUrl,
      publicUrl,
    });
  } catch (err) {
    console.error("SIGNED URL ERROR:", err);
    res.status(500).json({ message: "Failed to create upload URL" });
  }
};
