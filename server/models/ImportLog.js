const mongoose = require("mongoose");

const importLogSchema = new mongoose.Schema(
  {
    jobId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "ImportJob", 
      index: true 
    },
    sheetName: String,
    row: Number,
    name: String,
    contact_number: String,
    reason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ImportLog", importLogSchema);
