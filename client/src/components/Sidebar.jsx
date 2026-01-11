import { NavLink, useNavigate } from "react-router-dom";
import { Users, Send, LogOut, Menu, X } from "lucide-react";
import { useState } from "react";
import Swal from "sweetalert2";

export default function Sidebar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const linkBase =
    "flex items-center gap-3 p-2.5 rounded-lg transition-all no-underline";

  const linkStyle = ({ isActive }) =>
    `${linkBase} ${
      isActive
        ? "bg-blue-600 text-white shadow text-decoration-none"
        : "text-gray-700 hover:bg-gray-100 text-decoration-none"
    }`;

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: "Logout?",
      text: "Are you sure you want to logout?",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Logout",
      cancelButtonText: "Cancel",
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
          w-64 min-h-screen bg-white border-r flex flex-col
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
        <nav className="p-3 space-y-2 flex-1">
          <NavLink
            to="/dashboard"
            end
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <Users size={18} />
            <span className="font-medium">Manage Contacts</span>
          </NavLink>

          <NavLink
            to="/dashboard/send"
            className={linkStyle}
            onClick={() => setOpen(false)}
          >
            <Send size={18} />
            <span className="font-medium">Send Messages</span>
          </NavLink>
        </nav>

        {/* Logout */}
        <div className="p-3 border-t">
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
