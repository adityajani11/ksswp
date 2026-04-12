import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { runWithSwalLoader } from "../utils/swalLoading";

const OTP_PURPOSE = {
  CHANGE_USERNAME: "CHANGE_USERNAME",
  CHANGE_LOGIN_PASSWORD: "CHANGE_LOGIN_PASSWORD",
  CHANGE_DELETE_PASSWORD: "CHANGE_DELETE_PASSWORD",
  CHANGE_CONTACT_NUMBER: "CHANGE_CONTACT_NUMBER",
};

function normalizeContactNumberInput(value) {
  const digits = String(value || "")
    .trim()
    .replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length < 11 || digits.length > 15) {
    return "";
  }

  return digits;
}

function formatContactNumberDisplay(value) {
  const normalized = normalizeContactNumberInput(value);
  return normalized ? `+${normalized}` : "";
}

function validatePasswordPayload(newPassword, confirmPassword) {
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

async function promptOtp(purposeLabel, maskedPhone) {
  const result = await Swal.fire({
    title: `Verify OTP for ${purposeLabel}`,
    text: maskedPhone
      ? `Enter the OTP sent to ${maskedPhone}`
      : "Enter the OTP sent on WhatsApp",
    input: "text",
    inputPlaceholder: "6-digit OTP",
    inputAttributes: {
      inputmode: "numeric",
      autocomplete: "one-time-code",
      maxlength: "6",
    },
    showCancelButton: true,
    confirmButtonText: "Verify OTP",
    cancelButtonText: "Cancel",
    inputValidator: (value) => {
      const normalizedOtp = String(value || "")
        .trim()
        .replace(/\D/g, "");
      if (!/^\d{6}$/.test(normalizedOtp)) {
        return "Enter a valid 6-digit OTP";
      }

      return undefined;
    },
  });

  if (!result.isConfirmed) {
    return null;
  }

  return String(result.value || "")
    .trim()
    .replace(/\D/g, "");
}

export default function Settings() {
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [workingAction, setWorkingAction] = useState("");
  const [currentUsername, setCurrentUsername] = useState("");
  const [currentContactNumber, setCurrentContactNumber] = useState("");
  const [otpMaskedPhone, setOtpMaskedPhone] = useState("");

  const [nextUsername, setNextUsername] = useState("");
  const [nextContactNumber, setNextContactNumber] = useState("");
  const [newLoginPassword, setNewLoginPassword] = useState("");
  const [confirmLoginPassword, setConfirmLoginPassword] = useState("");
  const [newDeletePassword, setNewDeletePassword] = useState("");
  const [confirmDeletePassword, setConfirmDeletePassword] = useState("");

  const isBusy = Boolean(workingAction);
  const usernameChanged = useMemo(
    () => String(nextUsername || "").trim() !== String(currentUsername || "").trim(),
    [nextUsername, currentUsername],
  );

  const loadProfile = async () => {
    try {
      setLoadingProfile(true);
      const res = await api.get("/auth/profile");
      const username = String(res.data?.user?.username || "");
      const contactNumberRaw = String(res.data?.user?.contactNumberRaw || "")
        .trim()
        .replace(/\D/g, "");
      const contactNumberDisplay =
        String(res.data?.user?.contactNumber || "").trim() ||
        formatContactNumberDisplay(contactNumberRaw);
      const maskedPhone = String(res.data?.user?.otpMaskedPhone || "");

      setCurrentUsername(username);
      setNextUsername(username);
      setCurrentContactNumber(contactNumberRaw);
      setNextContactNumber(contactNumberDisplay);
      setOtpMaskedPhone(maskedPhone);
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to load profile"),
        "error",
      );
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const sendOtpForPurpose = async (purpose, purposeLabel) => {
    const res = await runWithSwalLoader(
      {
        title: "Sending OTP",
        text: `Requesting OTP for ${purposeLabel}...`,
      },
      () =>
        api.post("/auth/send-otp", {
          purpose,
        }),
    );

    const maskedPhone =
      String(res.data?.otpMaskedPhone || "").trim() || otpMaskedPhone;
    if (maskedPhone) {
      setOtpMaskedPhone(maskedPhone);
    }

    return maskedPhone;
  };

  const handleChangeUsername = async () => {
    const normalizedUsername = String(nextUsername || "").trim();
    if (!normalizedUsername) {
      Swal.fire("Required", "Username is required", "warning");
      return;
    }

    if (!usernameChanged) {
      Swal.fire("No changes", "Enter a different username", "info");
      return;
    }

    setWorkingAction("username");
    try {
      const maskedPhone = await sendOtpForPurpose(
        OTP_PURPOSE.CHANGE_USERNAME,
        "username change",
      );

      const otp = await promptOtp("Username Change", maskedPhone);
      if (!otp) {
        return;
      }

      const res = await runWithSwalLoader(
        {
          title: "Updating username",
          text: "Verifying OTP and saving username...",
        },
        () =>
          api.post("/auth/verify-otp/change-username", {
            otp,
            username: normalizedUsername,
          }),
      );

      const updatedUsername = String(res.data?.user?.username || normalizedUsername);
      setCurrentUsername(updatedUsername);
      setNextUsername(updatedUsername);

      Swal.fire(
        "Updated",
        `Username changed to "${updatedUsername}" successfully.`,
        "success",
      );
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to change username"),
        "error",
      );
    } finally {
      setWorkingAction("");
    }
  };

  const handleChangeLoginPassword = async () => {
    const validationError = validatePasswordPayload(
      newLoginPassword,
      confirmLoginPassword,
    );
    if (validationError) {
      Swal.fire("Invalid", validationError, "warning");
      return;
    }

    setWorkingAction("login-password");
    try {
      const maskedPhone = await sendOtpForPurpose(
        OTP_PURPOSE.CHANGE_LOGIN_PASSWORD,
        "login password change",
      );

      const otp = await promptOtp("Login Password Change", maskedPhone);
      if (!otp) {
        return;
      }

      await runWithSwalLoader(
        {
          title: "Updating login password",
          text: "Verifying OTP and updating login password...",
        },
        () =>
          api.post("/auth/verify-otp/change-login-password", {
            otp,
            newPassword: newLoginPassword,
            confirmPassword: confirmLoginPassword,
          }),
      );

      setNewLoginPassword("");
      setConfirmLoginPassword("");

      Swal.fire("Updated", "Login password updated successfully.", "success");
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to update login password"),
        "error",
      );
    } finally {
      setWorkingAction("");
    }
  };

  const handleChangeDeletePassword = async () => {
    const validationError = validatePasswordPayload(
      newDeletePassword,
      confirmDeletePassword,
    );
    if (validationError) {
      Swal.fire("Invalid", validationError, "warning");
      return;
    }

    setWorkingAction("delete-password");
    try {
      const maskedPhone = await sendOtpForPurpose(
        OTP_PURPOSE.CHANGE_DELETE_PASSWORD,
        "delete password change",
      );

      const otp = await promptOtp("Delete Password Change", maskedPhone);
      if (!otp) {
        return;
      }

      await runWithSwalLoader(
        {
          title: "Updating delete password",
          text: "Verifying OTP and updating delete password...",
        },
        () =>
          api.post("/auth/verify-otp/change-delete-password", {
            otp,
            newPassword: newDeletePassword,
            confirmPassword: confirmDeletePassword,
          }),
      );

      setNewDeletePassword("");
      setConfirmDeletePassword("");

      Swal.fire("Updated", "Delete password updated successfully.", "success");
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to update delete password"),
        "error",
      );
    } finally {
      setWorkingAction("");
    }
  };

  const handleChangeContactNumber = async () => {
    const normalizedNextContactNumber = normalizeContactNumberInput(
      nextContactNumber,
    );

    if (!normalizedNextContactNumber) {
      Swal.fire(
        "Invalid",
        "Enter a valid contact number (for example +919824650646)",
        "warning",
      );
      return;
    }

    if (normalizedNextContactNumber === currentContactNumber) {
      Swal.fire("No changes", "Enter a different contact number", "info");
      return;
    }

    setWorkingAction("contact-number");
    try {
      const maskedPhone = await sendOtpForPurpose(
        OTP_PURPOSE.CHANGE_CONTACT_NUMBER,
        "contact number change",
      );

      const otp = await promptOtp("Contact Number Change", maskedPhone);
      if (!otp) {
        return;
      }

      const res = await runWithSwalLoader(
        {
          title: "Updating contact number",
          text: "Verifying OTP on old number and updating contact number...",
        },
        () =>
          api.post("/auth/verify-otp/change-contact-number", {
            otp,
            contactNumber: normalizedNextContactNumber,
          }),
      );

      const updatedContactRaw = String(res.data?.user?.contactNumberRaw || "")
        .trim()
        .replace(/\D/g, "");
      const updatedContactDisplay =
        String(res.data?.user?.contactNumber || "").trim() ||
        formatContactNumberDisplay(updatedContactRaw);
      const updatedMaskedPhone = String(res.data?.user?.otpMaskedPhone || "");

      setCurrentContactNumber(updatedContactRaw);
      setNextContactNumber(updatedContactDisplay);
      if (updatedMaskedPhone) {
        setOtpMaskedPhone(updatedMaskedPhone);
      }

      Swal.fire(
        "Updated",
        `Contact number changed to "${updatedContactDisplay}" successfully.`,
        "success",
      );
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to update contact number"),
        "error",
      );
    } finally {
      setWorkingAction("");
    }
  };

  if (loadingProfile) {
    return <p className="text-gray-500">Loading settings...</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-semibold">Settings</h2>
        <p className="text-sm text-gray-600 mt-1">
          All credential changes require OTP verification on WhatsApp.
        </p>
        {otpMaskedPhone && (
          <p className="text-xs text-gray-500 mt-1">
            OTP destination: {otpMaskedPhone}
          </p>
        )}
      </div>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h3 className="text-lg font-semibold">Change Username</h3>
        <p className="text-sm text-gray-600">
          Current username: <span className="font-medium">{currentUsername}</span>
        </p>
        <input
          type="text"
          value={nextUsername}
          onChange={(e) => setNextUsername(e.target.value)}
          placeholder="Enter new username"
          className="w-full border p-2 rounded"
          disabled={isBusy}
        />
        <button
          type="button"
          onClick={handleChangeUsername}
          disabled={isBusy || !usernameChanged}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {workingAction === "username" ? "Please wait..." : "Change Username"}
        </button>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h3 className="text-lg font-semibold">Change Contact Number</h3>
        <p className="text-sm text-gray-600">
          Current contact number:
          <span className="font-medium">
            {" "}
            {formatContactNumberDisplay(currentContactNumber) || "Not set"}
          </span>
        </p>
        <p className="text-xs text-gray-500">
          OTP will be sent to the old contact number for verification.
        </p>
        <input
          type="text"
          value={nextContactNumber}
          onChange={(e) => setNextContactNumber(e.target.value)}
          placeholder="Enter new contact number (e.g. +919824650646)"
          className="w-full border p-2 rounded"
          disabled={isBusy}
        />
        <button
          type="button"
          onClick={handleChangeContactNumber}
          disabled={isBusy}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {workingAction === "contact-number"
            ? "Please wait..."
            : "Change Contact Number"}
        </button>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h3 className="text-lg font-semibold">Change Login Password</h3>
        <input
          type="password"
          value={newLoginPassword}
          onChange={(e) => setNewLoginPassword(e.target.value)}
          placeholder="New login password"
          className="w-full border p-2 rounded"
          disabled={isBusy}
        />
        <input
          type="password"
          value={confirmLoginPassword}
          onChange={(e) => setConfirmLoginPassword(e.target.value)}
          placeholder="Confirm new login password"
          className="w-full border p-2 rounded"
          disabled={isBusy}
        />
        <button
          type="button"
          onClick={handleChangeLoginPassword}
          disabled={isBusy}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {workingAction === "login-password"
            ? "Please wait..."
            : "Change Login Password"}
        </button>
      </section>

      <section className="bg-white border rounded-lg p-4 space-y-3">
        <h3 className="text-lg font-semibold">Change Delete Password</h3>
        <input
          type="password"
          value={newDeletePassword}
          onChange={(e) => setNewDeletePassword(e.target.value)}
          placeholder="New delete password"
          className="w-full border p-2 rounded"
          disabled={isBusy}
        />
        <input
          type="password"
          value={confirmDeletePassword}
          onChange={(e) => setConfirmDeletePassword(e.target.value)}
          placeholder="Confirm new delete password"
          className="w-full border p-2 rounded"
          disabled={isBusy}
        />
        <button
          type="button"
          onClick={handleChangeDeletePassword}
          disabled={isBusy}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {workingAction === "delete-password"
            ? "Please wait..."
            : "Change Delete Password"}
        </button>
      </section>
    </div>
  );
}
