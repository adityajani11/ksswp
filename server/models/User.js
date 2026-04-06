const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
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
});

module.exports = mongoose.model("User", userSchema);
