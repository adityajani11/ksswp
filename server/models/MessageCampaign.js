const mongoose = require("mongoose");

const recipientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    to: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["queued", "sent", "failed"],
      default: "queued",
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
    },
    lastTriedAt: Date,
    sentAt: Date,
    messageId: String,
    lastError: String,
    deliveryStatus: {
      type: String,
      enum: ["pending", "sent", "delivered", "read", "failed"],
      default: "pending",
    },
    statusUpdatedAt: Date,
    deliveredAt: Date,
    readAt: Date,
  },
  { _id: false },
);

const messageCampaignSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["text", "image", "video", "document"],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    link: String,
    mediaMimeType: String,
    mediaFileName: String,
    mediaId: String,
    useMediaLink: {
      type: Boolean,
      default: false,
    },
    mediaUploadAttempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxAttempts: {
      type: Number,
      default: Number(process.env.WHATSAPP_MAX_ATTEMPTS || 4),
      min: 1,
      max: 10,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "processing",
        "completed",
        "completed_with_failures",
        "failed",
      ],
      default: "queued",
    },
    recipients: {
      type: [recipientSchema],
      default: [],
    },
    totalRecipients: {
      type: Number,
      required: true,
      min: 0,
    },
    successCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    nextRunAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lockId: String,
    lockedAt: Date,
    startedAt: Date,
    completedAt: Date,
    lastError: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

messageCampaignSchema.index({
  status: 1,
  nextRunAt: 1,
  lockedAt: 1,
  createdAt: 1,
});

module.exports = mongoose.model("MessageCampaign", messageCampaignSchema);
