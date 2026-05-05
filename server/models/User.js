const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  displayName: {
    type: String,
    default: "",
  },
  password: {
    type: String,
    required: true,
  },
  deletePassword: {
    type: String,
    default: "",
  },
  contactNumber: {
    type: String,
    default: "919824650646",
    trim: true,
  },
  passwordVersion: {
    type: Number,
    default: 2,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
