export function getContactPhoneValue(contact) {
  return String(
    contact?.phone ??
      contact?.mobile ??
      contact?.mobileNumber ??
      contact?.phoneNumber ??
      "",
  ).trim();
}

export function toDisplayPhone(phone) {
  const normalizedPhone = String(phone || "").replace(/^\+/, "").trim();
  return normalizedPhone ? `+${normalizedPhone}` : "";
}
