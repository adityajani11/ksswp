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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Group", groupSchema);
