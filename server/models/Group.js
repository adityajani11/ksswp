const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    contacts: [
      {
        name: {
          type: String,
          required: true,
          maxlength: 200,
          trim: true,
        },
        phone: {
          type: String,
          required: true,
          match: /^91\d{10}$/,
        },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    importJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportJob",
      index: true
    },
  },
  { timestamps: true }
);

groupSchema.index({ createdAt: -1 });
groupSchema.index({ "contacts.phone": 1 });

module.exports = mongoose.model("Group", groupSchema);
