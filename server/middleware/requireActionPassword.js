const bcrypt = require("bcrypt");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    const actionPassword = String(
      req.headers["x-action-password"] || req.body?.actionPassword || "",
    );

    if (!actionPassword) {
      return res.status(400).json({
        message: "Delete password is required for delete action",
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("password deletePassword");
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const deletePasswordHash = String(user.deletePassword || user.password || "");
    const passwordOk = await bcrypt.compare(actionPassword, deletePasswordHash);
    if (!passwordOk) {
      return res.status(403).json({
        message: "Invalid delete password",
      });
    }

    return next();
  } catch (err) {
    return res.status(500).json({
      message: "Failed to verify delete password",
      error: err.message,
    });
  }
};
