const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const User = require("../models/User");

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
