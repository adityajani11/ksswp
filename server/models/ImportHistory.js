const mongoose = require("mongoose");

const importHistorySchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: true,
    },
    totalImported: {
      type: Number,
      default: 0,
    },
    totalSkipped: {
      type: Number,
      default: 0,
    },
    skipDetails: [
      {
        reason: { type: String },
        sheetName: { type: String },
        row: { type: Number },
        name: { type: String },
        contact_number: { type: mongoose.Schema.Types.Mixed },
      },
    ],
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    duration: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImportHistory", importHistorySchema);
