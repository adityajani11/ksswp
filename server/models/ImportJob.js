const mongoose = require("mongoose");

const importJobSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["processing", "completed", "failed", "cancelled"],
      default: "processing",
    },
    phase: {
      type: String,
      enum: ["queued", "counting", "processing", "finalizing", "completed", "failed", "cancelled"],
      default: "queued",
    },
    total: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    imported: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    progress: { type: Number, default: 0 },
    eta: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    originalName: { type: String },
    filePath: { type: String },
    error: { type: String },
    importHistoryId: { type: mongoose.Schema.Types.ObjectId, ref: "ImportHistory" },
    startTime: { type: Date, default: Date.now },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImportJob", importJobSchema);
