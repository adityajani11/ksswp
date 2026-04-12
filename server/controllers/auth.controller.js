const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const axios = require("axios");
const User = require("../models/User");
const { saveOtpDb, verifyOtpDb, normalizePhone } = require("../utils/otpDbStore");
const {
  PASSWORD_SCHEMA_VERSION,
  DEFAULT_ADMIN_CONTACT_NUMBER,
} = require("../utils/passwordMigration");

const OTP_PURPOSES = {
  CHANGE_USERNAME: "CHANGE_USERNAME",
  CHANGE_LOGIN_PASSWORD: "CHANGE_LOGIN_PASSWORD",
  CHANGE_DELETE_PASSWORD: "CHANGE_DELETE_PASSWORD",
  CHANGE_CONTACT_NUMBER: "CHANGE_CONTACT_NUMBER",
};

const OTP_PURPOSE_SET = new Set(Object.values(OTP_PURPOSES));
const DEFAULT_OTP_TEMPLATE_NAME = "send_otp_message";
const DEFAULT_OTP_LANGUAGE_CODE = "en";

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskPhone(phone) {
  const normalizedPhone = normalizeAdminContactNumber(phone, { allowEmpty: true });
  if (!normalizedPhone) {
    return "";
  }

  if (normalizedPhone.length <= 4) {
    return normalizedPhone;
  }

  return `${"*".repeat(Math.max(normalizedPhone.length - 4, 2))}${normalizedPhone.slice(-4)}`;
}

function normalizeAdminContactNumber(contactNumber, options = {}) {
  const allowEmpty = Boolean(options.allowEmpty);
  const normalizedDigits = normalizePhone(contactNumber);

  if (!normalizedDigits) {
    return allowEmpty ? "" : null;
  }

  // If admin enters 10-digit local number, assume India country code.
  if (/^\d{10}$/.test(normalizedDigits)) {
    return `91${normalizedDigits}`;
  }

  if (normalizedDigits.length < 11 || normalizedDigits.length > 15) {
    return null;
  }

  return normalizedDigits;
}

function formatDisplayPhone(phone) {
  const normalizedPhone = normalizeAdminContactNumber(phone, { allowEmpty: true });
  return normalizedPhone ? `+${normalizedPhone}` : "";
}

function getOtpPhoneForUser(user) {
  const directPhone = normalizeAdminContactNumber(user?.contactNumber, {
    allowEmpty: true,
  });
  if (directPhone) {
    return directPhone;
  }

  const fallbackPhone = normalizeAdminContactNumber(
    process.env.DEFAULT_ADMIN_CONTACT_NUMBER ||
      process.env.ADMIN_CONTACT_NUMBER ||
      process.env.OTP_ADMIN_PHONE ||
      process.env.WHATSAPP_OTP_PHONE ||
      DEFAULT_ADMIN_CONTACT_NUMBER,
    { allowEmpty: true },
  );

  return fallbackPhone;
}

function normalizeUsername(username) {
  return String(username || "").trim();
}

function validateNewPassword(newPassword, confirmPassword) {
  if (!newPassword || !confirmPassword) {
    return "New password and confirm password are required";
  }

  if (String(newPassword).length < 6) {
    return "New password must be at least 6 characters";
  }

  if (String(newPassword).length > 128) {
    return "New password is too long";
  }

  if (newPassword !== confirmPassword) {
    return "New password and confirm password must match";
  }

  return null;
}

function validateAndNormalizeNextContactNumber(contactNumber) {
  const normalizedContactNumber = normalizeAdminContactNumber(contactNumber, {
    allowEmpty: false,
  });

  if (!normalizedContactNumber) {
    return {
      normalizedContactNumber: null,
      error:
        "Enter a valid contact number (10 digits local or country-code format, e.g. +919824650646)",
    };
  }

  return {
    normalizedContactNumber,
    error: null,
  };
}

async function sendOtpTemplate({ phone, otp }) {
  const whatsappApiUrl = String(process.env.WHATSAPP_API_URL || "").trim();
  const whatsappToken = String(
    process.env.WHATAPI_TOKEN || process.env.WHATSAPP_TOKEN || "",
  ).trim();

  if (!whatsappApiUrl || !whatsappToken) {
    throw new Error("WhatsApp OTP configuration is missing");
  }

  const templatePayload = {
    to: phone,
    recipient_type: "individual",
    type: "template",
    template: {
      language: {
        policy: "deterministic",
        code:
          String(process.env.WHATSAPP_OTP_LANGUAGE_CODE || "").trim() ||
          DEFAULT_OTP_LANGUAGE_CODE,
      },
      name:
        String(process.env.WHATSAPP_OTP_TEMPLATE_NAME || "").trim() ||
        DEFAULT_OTP_TEMPLATE_NAME,
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: otp }],
        },
        {
          type: "button",
          sub_type: "url",
          index: 0,
          parameters: [{ type: "text", text: otp }],
        },
      ],
    },
  };

  await axios.post(whatsappApiUrl, templatePayload, {
    headers: {
      Authorization: `Bearer ${whatsappToken}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
  });
}

async function getAuthenticatedUser(req, fields = "") {
  const userId = req.user?.id;
  if (!userId) {
    return null;
  }

  const selection = fields || "username password deletePassword contactNumber";
  return User.findById(userId).select(selection);
}

/**
 * REGISTER (ONLY ONCE)
 */
exports.register = async (req, res) => {
  try {
    const { username, password, contactNumber } = req.body || {};
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    const totalUsers = await User.countDocuments();
    if (totalUsers > 0) {
      return res.status(403).json({
        message: "Registration is disabled. Account already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const normalizedContactNumber =
      normalizeAdminContactNumber(contactNumber, { allowEmpty: false }) ||
      normalizeAdminContactNumber(
        process.env.DEFAULT_ADMIN_CONTACT_NUMBER || DEFAULT_ADMIN_CONTACT_NUMBER,
        { allowEmpty: false },
      );

    const user = await User.create({
      username: normalizedUsername,
      password: hashedPassword,
      deletePassword: hashedPassword,
      contactNumber: normalizedContactNumber,
      passwordVersion: PASSWORD_SCHEMA_VERSION,
    });

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      userId: user._id,
    });
  } catch (err) {
    return res.status(500).json({
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
    const { username, password } = req.body || {};
    const normalizedUsername = normalizeUsername(username);

    if (!normalizedUsername || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    const user = await User.findOne({ username: normalizedUsername });
    if (!user) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    if (user.isActive === false) {
      return res.status(403).json({
        message: "Your account has been deactivated. Please contact the administrator.",
      });
    }

    const isValidLogin = await bcrypt.compare(password, user.password);
    if (!isValidLogin) {
      return res.status(400).json({
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.json({
      success: true,
      token,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Login failed",
      error: err.message,
    });
  }
};

/**
 * PROFILE
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req, "username contactNumber");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otpPhone = getOtpPhoneForUser(user);

    return res.json({
      success: true,
      user: {
        username: user.username,
        contactNumber: formatDisplayPhone(otpPhone),
        contactNumberRaw: otpPhone || "",
        otpMaskedPhone: maskPhone(otpPhone),
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to load profile",
      error: err.message,
    });
  }
};

/**
 * SEND OTP FOR SETTINGS CREDENTIAL ACTIONS
 */
exports.sendCredentialOtp = async (req, res) => {
  try {
    const purpose = String(req.body?.purpose || "")
      .trim()
      .toUpperCase();

    if (!OTP_PURPOSE_SET.has(purpose)) {
      return res.status(400).json({
        message: "Invalid OTP purpose",
      });
    }

    const user = await getAuthenticatedUser(req, "username contactNumber");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otpPhone = getOtpPhoneForUser(user);
    if (!otpPhone) {
      return res.status(400).json({
        message:
          "Admin contact number is missing. Set contactNumber on user or configure ADMIN_CONTACT_NUMBER.",
      });
    }

    const otp = generateOtp();

    await saveOtpDb({
      userId: user._id,
      phone: otpPhone,
      otp,
      purpose,
    });

    await sendOtpTemplate({
      phone: otpPhone,
      otp,
    });

    return res.json({
      success: true,
      message: "OTP sent successfully",
      purpose,
      otpMaskedPhone: maskPhone(otpPhone),
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to send OTP",
      error: err.message,
    });
  }
};

/**
 * VERIFY OTP + CHANGE USERNAME
 */
exports.verifyOtpAndChangeUsername = async (req, res) => {
  try {
    const otp = String(req.body?.otp || "").trim();
    const nextUsername = normalizeUsername(req.body?.username);

    if (!nextUsername) {
      return res.status(400).json({
        message: "Username is required",
      });
    }

    if (!otp) {
      return res.status(400).json({
        message: "OTP is required",
      });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (nextUsername === String(user.username || "").trim()) {
      return res.status(400).json({
        message: "New username must be different from current username",
      });
    }

    const existingUser = await User.findOne({
      username: nextUsername,
      _id: { $ne: user._id },
    }).select("_id");

    if (existingUser) {
      return res.status(400).json({
        message: "Username is already taken",
      });
    }

    const otpPhone = getOtpPhoneForUser(user);
    if (!otpPhone) {
      return res.status(400).json({
        message: "Admin contact number is missing for OTP verification",
      });
    }

    const isOtpValid = await verifyOtpDb({
      userId: user._id,
      phone: otpPhone,
      otp,
      purpose: OTP_PURPOSES.CHANGE_USERNAME,
    });

    if (!isOtpValid) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
      });
    }

    user.username = nextUsername;
    await user.save();

    return res.json({
      success: true,
      message: "Username updated successfully",
      user: {
        username: user.username,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to update username",
      error: err.message,
    });
  }
};

/**
 * VERIFY OTP + CHANGE LOGIN PASSWORD
 */
exports.verifyOtpAndChangeLoginPassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body || {};
    const otp = String(req.body?.otp || "").trim();

    const passwordValidationError = validateNewPassword(
      newPassword,
      confirmPassword,
    );
    if (passwordValidationError) {
      return res.status(400).json({
        message: passwordValidationError,
      });
    }

    if (!otp) {
      return res.status(400).json({
        message: "OTP is required",
      });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otpPhone = getOtpPhoneForUser(user);
    if (!otpPhone) {
      return res.status(400).json({
        message: "Admin contact number is missing for OTP verification",
      });
    }

    const isOtpValid = await verifyOtpDb({
      userId: user._id,
      phone: otpPhone,
      otp,
      purpose: OTP_PURPOSES.CHANGE_LOGIN_PASSWORD,
    });

    if (!isOtpValid) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
      });
    }

    const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({
        message: "New login password must be different from current login password",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordVersion = PASSWORD_SCHEMA_VERSION;
    await user.save();

    return res.json({
      success: true,
      message: "Login password updated successfully",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to update login password",
      error: err.message,
    });
  }
};

/**
 * VERIFY OTP + CHANGE DELETE PASSWORD
 */
exports.verifyOtpAndChangeDeletePassword = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body || {};
    const otp = String(req.body?.otp || "").trim();

    const passwordValidationError = validateNewPassword(
      newPassword,
      confirmPassword,
    );
    if (passwordValidationError) {
      return res.status(400).json({
        message: passwordValidationError,
      });
    }

    if (!otp) {
      return res.status(400).json({
        message: "OTP is required",
      });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const otpPhone = getOtpPhoneForUser(user);
    if (!otpPhone) {
      return res.status(400).json({
        message: "Admin contact number is missing for OTP verification",
      });
    }

    const isOtpValid = await verifyOtpDb({
      userId: user._id,
      phone: otpPhone,
      otp,
      purpose: OTP_PURPOSES.CHANGE_DELETE_PASSWORD,
    });

    if (!isOtpValid) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
      });
    }

    const currentDeletePasswordHash = String(
      user.deletePassword || user.password || "",
    );
    const isSameAsCurrent = await bcrypt.compare(
      newPassword,
      currentDeletePasswordHash,
    );
    if (isSameAsCurrent) {
      return res.status(400).json({
        message:
          "New delete password must be different from current delete password",
      });
    }

    user.deletePassword = await bcrypt.hash(newPassword, 10);
    user.passwordVersion = PASSWORD_SCHEMA_VERSION;
    await user.save();

    return res.json({
      success: true,
      message: "Delete password updated successfully",
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to update delete password",
      error: err.message,
    });
  }
};

/**
 * VERIFY OTP (sent to old number) + CHANGE CONTACT NUMBER
 */
exports.verifyOtpAndChangeContactNumber = async (req, res) => {
  try {
    const otp = String(req.body?.otp || "").trim();
    const { normalizedContactNumber, error } =
      validateAndNormalizeNextContactNumber(req.body?.contactNumber);

    if (error) {
      return res.status(400).json({
        message: error,
      });
    }

    if (!otp) {
      return res.status(400).json({
        message: "OTP is required",
      });
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const oldContactNumber = getOtpPhoneForUser(user);
    if (!oldContactNumber) {
      return res.status(400).json({
        message: "Old contact number is missing for OTP verification",
      });
    }

    if (normalizedContactNumber === oldContactNumber) {
      return res.status(400).json({
        message: "New contact number must be different from current contact number",
      });
    }

    const isOtpValid = await verifyOtpDb({
      userId: user._id,
      phone: oldContactNumber,
      otp,
      purpose: OTP_PURPOSES.CHANGE_CONTACT_NUMBER,
    });

    if (!isOtpValid) {
      return res.status(400).json({
        message: "Invalid or expired OTP",
      });
    }

    user.contactNumber = normalizedContactNumber;
    await user.save();

    return res.json({
      success: true,
      message: "Contact number updated successfully",
      user: {
        contactNumber: formatDisplayPhone(user.contactNumber),
        contactNumberRaw: user.contactNumber,
        otpMaskedPhone: maskPhone(user.contactNumber),
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to update contact number",
      error: err.message,
    });
  }
};

/**
 * Legacy endpoint retained for compatibility.
 */
exports.changePassword = async (req, res) => {
  return res.status(410).json({
    message:
      "Direct password change is deprecated. Use OTP-based settings endpoints.",
  });
};

exports.OTP_PURPOSES = OTP_PURPOSES;
