const bcrypt = require("bcrypt");
const OtpCode = require("../models/OtpCode");

const DEFAULT_OTP_TTL_SECONDS = 300;

function getOtpTtlSeconds() {
  const parsed = Number(process.env.OTP_TTL_SECONDS);
  if (!Number.isFinite(parsed) || parsed < 30) {
    return DEFAULT_OTP_TTL_SECONDS;
  }

  return Math.floor(parsed);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function saveOtpDb({ userId, phone, otp, purpose }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedPurpose = String(purpose || "").trim().toUpperCase();
  const normalizedOtp = String(otp || "").trim();

  if (!userId || !normalizedPhone || !normalizedPurpose || !normalizedOtp) {
    throw new Error("Invalid OTP payload");
  }

  await OtpCode.deleteMany({
    userId,
    phone: normalizedPhone,
    purpose: normalizedPurpose,
    consumedAt: null,
  });

  const otpHash = await bcrypt.hash(normalizedOtp, 10);
  const expiresAt = new Date(Date.now() + getOtpTtlSeconds() * 1000);

  await OtpCode.create({
    userId,
    phone: normalizedPhone,
    purpose: normalizedPurpose,
    otpHash,
    expiresAt,
  });
}

async function verifyOtpDb({ userId, phone, otp, purpose }) {
  const normalizedPhone = normalizePhone(phone);
  const normalizedPurpose = String(purpose || "").trim().toUpperCase();
  const normalizedOtp = String(otp || "").trim();

  if (!userId || !normalizedPhone || !normalizedPurpose || !normalizedOtp) {
    return false;
  }

  const otpDoc = await OtpCode.findOne({
    userId,
    phone: normalizedPhone,
    purpose: normalizedPurpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otpDoc) {
    return false;
  }

  const isMatch = await bcrypt.compare(normalizedOtp, otpDoc.otpHash);
  if (!isMatch) {
    return false;
  }

  otpDoc.consumedAt = new Date();
  await otpDoc.save();

  return true;
}

module.exports = {
  saveOtpDb,
  verifyOtpDb,
  normalizePhone,
};
