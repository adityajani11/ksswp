import Swal from "sweetalert2";

export const DEVELOPER_PASSWORD = "Aditya##@@505";

export const SECURITY_MODAL_OPTIONS = {
  allowOutsideClick: false,
  allowEscapeKey: false,
};

export function withActionPasswordHeader(actionPassword) {
  return {
    headers: {
      "x-action-password": actionPassword,
    },
  };
}

export async function promptDeveloperPassword() {
  const result = await Swal.fire({
    title: "Enter developer password",
    text: "Developer password is required to continue.",
    input: "password",
    inputPlaceholder: "Developer password",
    inputAttributes: {
      autocapitalize: "off",
      autocorrect: "off",
      spellcheck: "false",
      autocomplete: "current-password",
    },
    showCancelButton: true,
    confirmButtonText: "Verify",
    cancelButtonText: "Cancel",
    inputValidator: (value) => {
      if (!String(value || "").trim()) {
        return "Developer password is required";
      }

      return undefined;
    },
    ...SECURITY_MODAL_OPTIONS,
  });

  if (!result.isConfirmed) {
    return null;
  }

  return String(result.value || "");
}

export async function promptLoginPasswordForDelete(options = {}) {
  const title =
    typeof options.title === "string" && options.title.trim()
      ? options.title
      : "Enter delete password";
  const text =
    typeof options.text === "string" && options.text.trim()
      ? options.text
      : "Delete password is required to continue.";
  const confirmButtonText =
    typeof options.confirmButtonText === "string" &&
    options.confirmButtonText.trim()
      ? options.confirmButtonText
      : "Continue";

  const result = await Swal.fire({
    title,
    text,
    input: "password",
    inputPlaceholder: "Delete password",
    inputAttributes: {
      autocapitalize: "off",
      autocorrect: "off",
      spellcheck: "false",
      autocomplete: "current-password",
    },
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: "Cancel",
    inputValidator: (value) => {
      if (!String(value || "").trim()) {
        return "Delete password is required";
      }

      return undefined;
    },
    ...SECURITY_MODAL_OPTIONS,
  });

  if (!result.isConfirmed) {
    return null;
  }

  return String(result.value || "");
}

export async function promptNewLoginPassword() {
  const result = await Swal.fire({
    title: "Set new login password",
    html: `
      <input id="swal-new-login-password" type="password" class="swal2-input" placeholder="New login password" autocomplete="new-password" />
      <input id="swal-confirm-login-password" type="password" class="swal2-input" placeholder="Confirm new login password" autocomplete="new-password" />
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Update Password",
    cancelButtonText: "Cancel",
    preConfirm: () => {
      const newPasswordInput = document.getElementById(
        "swal-new-login-password",
      );
      const confirmPasswordInput = document.getElementById(
        "swal-confirm-login-password",
      );

      const newPassword = String(newPasswordInput?.value || "");
      const confirmPassword = String(confirmPasswordInput?.value || "");

      if (!newPassword || !confirmPassword) {
        Swal.showValidationMessage("Both password fields are required");
        return null;
      }

      if (newPassword.length < 6) {
        Swal.showValidationMessage("New password must be at least 6 characters");
        return null;
      }

      if (newPassword.length > 128) {
        Swal.showValidationMessage("New password is too long");
        return null;
      }

      if (newPassword !== confirmPassword) {
        Swal.showValidationMessage("New password and confirm password must match");
        return null;
      }

      return {
        newPassword,
        confirmPassword,
      };
    },
    ...SECURITY_MODAL_OPTIONS,
  });

  if (!result.isConfirmed || !result.value) {
    return null;
  }

  return result.value;
}
