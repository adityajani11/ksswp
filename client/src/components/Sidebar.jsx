import { NavLink, useNavigate } from "react-router-dom";
import {
  Users,
  Send,
  LogOut,
  Menu,
  X,
  History,
  FileDown,
  Layers3,
  KeyRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { runWithSwalLoader } from "../utils/swalLoading";
import { fetchAllGroupsWithContacts } from "../utils/groupDirectory";
import {
  exportGroupsToCombinedPdf,
  exportGroupsToExcel,
  exportGroupsToPdfZip,
} from "../utils/groupExport";
import {
  DEVELOPER_PASSWORD,
  promptDeveloperPassword,
  promptNewLoginPassword,
  SECURITY_MODAL_OPTIONS,
} from "../utils/security";

const NO_GROUPS_TO_EXPORT = "NO_GROUPS_TO_EXPORT";
const PDF_EXPORT_OPTIONS_POPUP_CLASS = "pdf-export-options-popup";

async function promptExportType() {
  const result = await Swal.fire({
    title: "Export All Data",
    text: "Choose how you want to export all groups and contacts.",
    input: "radio",
    inputOptions: {
      excel: "EXCEL",
      pdf: "PDF",
    },
    inputValidator: (value) => {
      if (!value) {
        return "Please select an export format";
      }

      return undefined;
    },
    showCancelButton: true,
    confirmButtonText: "Continue",
    cancelButtonText: "Cancel",
  });

  return result.isConfirmed ? result.value : null;
}

async function promptPdfExportMode() {
  const result = await Swal.fire({
    title: "PDF Export Options",
    text: "Choose how the PDF export should be generated.",
    input: "radio",
    inputOptions: {
      separate: "Group wise Separate PDF (ZIP)",
      combined: "Download Combined PDF",
    },
    inputValidator: (value) => {
      if (!value) {
        return "Please select a PDF export option";
      }

      return undefined;
    },
    showCancelButton: true,
    confirmButtonText: "Start Export",
    cancelButtonText: "Cancel",
    customClass: {
      popup: PDF_EXPORT_OPTIONS_POPUP_CLASS,
    },
  });

  return result.isConfirmed ? result.value : null;
}

function getExportLoaderConfig(type, pdfMode) {
  if (type === "excel") {
    return {
      title: "Exporting Excel",
      text: "Preparing sheets for all groups...",
    };
  }

  if (pdfMode === "separate") {
    return {
      title: "Exporting PDFs",
      text: "Preparing group PDFs and ZIP archive...",
    };
  }

  return {
    title: "Exporting Combined PDF",
    text: "Preparing a single PDF for all groups...",
  };
}

export default function Sidebar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalBodyTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.touchAction = originalBodyTouchAction;
    };
  }, [open]);

  const linkBase =
    "flex items-center gap-3 p-2.5 rounded-lg transition-all no-underline";

  const linkStyle = ({ isActive }) =>
    `${linkBase} ${
      isActive
        ? "bg-blue-600 text-white shadow text-decoration-none"
        : "text-gray-700 hover:bg-gray-100 text-decoration-none"
    }`;

  const actionStyle = `${linkBase} w-full text-left border-0 bg-yellow-600 rounded text-white`;
  const securityActionStyle =
    `${linkBase} w-full text-left border border-blue-100 bg-blue-50 text-blue-700`;

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: "Logout?",
      text: "Are you sure you want to logout?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Logout",
      cancelButtonText: "Cancel",
      ...SECURITY_MODAL_OPTIONS,
    });

    if (!result.isConfirmed) return;

    localStorage.removeItem("token");

    Swal.fire({
      icon: "success",
      title: "Logged out",
      timer: 1000,
      showConfirmButton: false,
    });

    navigate("/");
  };

  const handleChangePassword = async () => {
    setOpen(false);

    const developerPassword = await promptDeveloperPassword();
    if (!developerPassword) {
      return;
    }

    if (developerPassword !== DEVELOPER_PASSWORD) {
      await Swal.fire({
        title: "Access denied",
        text: "Developer password is incorrect",
        icon: "error",
        ...SECURITY_MODAL_OPTIONS,
      });
      return;
    }

    const nextPasswordPayload = await promptNewLoginPassword();
    if (!nextPasswordPayload) {
      return;
    }

    try {
      await runWithSwalLoader(
        {
          title: "Updating password",
          text: "Saving your new login password...",
        },
        () =>
          api.post("/auth/change-password", {
            developerPassword,
            newPassword: nextPasswordPayload.newPassword,
            confirmPassword: nextPasswordPayload.confirmPassword,
          }),
      );

      Swal.fire({
        title: "Updated",
        text: "Login password updated successfully",
        icon: "success",
        ...SECURITY_MODAL_OPTIONS,
      });
    } catch (err) {
      Swal.fire({
        title: "Error",
        text: getApiErrorMessage(err, "Failed to update login password"),
        icon: "error",
        ...SECURITY_MODAL_OPTIONS,
      });
    }
  };

  const handleExportAllData = async () => {
    setOpen(false);

    const exportType = await promptExportType();

    if (!exportType) {
      return;
    }

    let pdfMode = null;

    if (exportType === "pdf") {
      pdfMode = await promptPdfExportMode();

      if (!pdfMode) {
        return;
      }
    }

    try {
      await runWithSwalLoader(
        getExportLoaderConfig(exportType, pdfMode),
        async () => {
          const groups = await fetchAllGroupsWithContacts({ force: true });

          if (!groups.length) {
            const error = new Error(NO_GROUPS_TO_EXPORT);
            error.code = NO_GROUPS_TO_EXPORT;
            throw error;
          }

          if (exportType === "excel") {
            await exportGroupsToExcel(groups);
            return;
          }

          if (pdfMode === "separate") {
            await exportGroupsToPdfZip(groups);
            return;
          }

          await exportGroupsToCombinedPdf(groups);
        },
      );
    } catch (err) {
      if (err?.code === NO_GROUPS_TO_EXPORT) {
        Swal.fire("No data", "No groups available to export", "warning");
        return;
      }

      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to export all data"),
        "error",
      );
    }
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-white shadow custom-hamburger-button"
        onClick={() => setOpen(true)}
      >
        <Menu size={22} />
      </button>

      {/* Backdrop (mobile only) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50
          w-64 h-[100dvh] md:h-screen overflow-hidden bg-white border-r flex flex-col
          transform transition-transform duration-300
          ${open ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        {/* Header */}
        <div className="p-3 border-b flex items-center justify-between">
          <h4 className="text-xl font-semibold text-gray-800">ADMIN CONTROL</h4>

          {/* Close button (mobile) */}
          <button className="md:hidden p-1" onClick={() => setOpen(false)}>
            <X size={20} />
          </button>
        </div>

        {/* Menu */}
        <nav className="p-3 space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <NavLink
            to="/dashboard/groups"
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <Users size={18} />
            <span className="font-medium">Groups</span>
          </NavLink>
          <NavLink
            to="/dashboard/batches"
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <Layers3 size={18} />
            <span className="font-medium">Batches</span>
          </NavLink>
          <NavLink
            to="/dashboard/send"
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <Send size={18} />
            <span className="font-medium">Send Messages</span>
          </NavLink>
          <NavLink
            to="/dashboard/image"
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <Users size={18} />
            <span className="font-medium">Send Image</span>
          </NavLink>
          <NavLink
            to="/dashboard/video"
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <Users size={18} />
            <span className="font-medium">Send Video</span>
          </NavLink>
          <NavLink
            to="/dashboard/document"
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <Users size={18} />
            <span className="font-medium">Send PDF</span>
          </NavLink>
          <NavLink
            to="/dashboard/history"
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <History size={18} />
            <span className="font-medium">Message History</span>
          </NavLink>
          <button
            type="button"
            onClick={handleExportAllData}
            className={actionStyle}
          >
            <FileDown size={18} />
            <span className="font-medium">Export All Data</span>
          </button>
          <button
            type="button"
            onClick={handleChangePassword}
            className={securityActionStyle}
          >
            <KeyRound size={18} />
            <span className="font-medium">Change Password</span>
          </button>
        </nav>

        {/* Logout */}
        <div className="p-3 border-t bg-white shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg text-red-600 hover:bg-red-50 transition"
          >
            <LogOut size={18} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
