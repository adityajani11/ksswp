const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/User");

const DEVELOPER_PASSWORD = "Aditya##@@505";

/**
 * REGISTER (ONLY ONCE)
 */
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    // CHECK IF ANY USER EXISTS
    const totalUsers = await User.countDocuments();
    if (totalUsers > 0) {
      return res.status(403).json({
        message: "Registration is disabled. Account already exists.",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      password: hashed,
    });

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      userId: user._id,
    });
  } catch (err) {
    res.status(500).json({
      message: "Registration failed",
      error: err.message,
    });
  }
};

/**
 * LOGIN
 */
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      success: true,
      token,
    });
  } catch (err) {
    res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};

/**
 * CHANGE LOGIN PASSWORD
 */
exports.changePassword = async (req, res) => {
  try {
    const { developerPassword, newPassword, confirmPassword } = req.body || {};

    if (!developerPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message:
          "Developer password, new password and confirm password are required",
      });
    }

    if (developerPassword !== DEVELOPER_PASSWORD) {
      return res.status(403).json({
        message: "Invalid developer password",
      });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters",
      });
    }

    if (String(newPassword).length > 128) {
      return res.status(400).json({
        message: "New password is too long",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirm password must match",
      });
    }

    const user = await User.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({
        message: "New password must be different from current password",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({
      success: true,
      message: "Login password updated successfully",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to change password",
      error: err.message,
    });
  }
};
