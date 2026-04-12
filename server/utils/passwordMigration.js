const bcrypt = require("bcrypt");
const User = require("../models/User");

const DEFAULT_LOGIN_PASSWORD = "KSS@2026";
const DEFAULT_ADMIN_CONTACT_NUMBER = "919824650646";
const PASSWORD_SCHEMA_VERSION = 2;

async function migrateLegacyPasswordSplit() {
  const legacyUsers = await User.find({
    $or: [
      { deletePassword: { $exists: false } },
      { deletePassword: "" },
      { passwordVersion: { $exists: false } },
      { passwordVersion: { $lt: PASSWORD_SCHEMA_VERSION } },
      { contactNumber: { $exists: false } },
      { contactNumber: "" },
    ],
  }).select("_id password deletePassword passwordVersion contactNumber");

  if (!legacyUsers.length) {
    return {
      inspected: 0,
      migrated: 0,
    };
  }

  const defaultLoginPassword =
    String(process.env.DEFAULT_LOGIN_PASSWORD || "").trim() ||
    DEFAULT_LOGIN_PASSWORD;
  const defaultAdminContactNumber =
    String(process.env.DEFAULT_ADMIN_CONTACT_NUMBER || "").trim() ||
    DEFAULT_ADMIN_CONTACT_NUMBER;
  const defaultLoginPasswordHash = await bcrypt.hash(defaultLoginPassword, 10);

  let migratedCount = 0;

  for (const user of legacyUsers) {
    let hasChanges = false;
    const hasDeletePassword = Boolean(String(user.deletePassword || "").trim());

    // First-time split: preserve current password as delete password,
    // and set login password to the required default.
    if (!hasDeletePassword && String(user.password || "").trim()) {
      user.deletePassword = user.password;
      user.password = defaultLoginPasswordHash;
      hasChanges = true;
    }

    if (Number(user.passwordVersion || 0) < PASSWORD_SCHEMA_VERSION) {
      user.passwordVersion = PASSWORD_SCHEMA_VERSION;
      hasChanges = true;
    }

    if (!String(user.contactNumber || "").trim()) {
      user.contactNumber = defaultAdminContactNumber;
      hasChanges = true;
    }

    if (hasChanges) {
      await user.save();
      migratedCount += 1;
    }
  }

  return {
    inspected: legacyUsers.length,
    migrated: migratedCount,
  };
}

module.exports = {
  migrateLegacyPasswordSplit,
  DEFAULT_LOGIN_PASSWORD,
  DEFAULT_ADMIN_CONTACT_NUMBER,
  PASSWORD_SCHEMA_VERSION,
};
