import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <main
        className="
          md:ml-64      /* reserve sidebar width on desktop */
          pt-14 md:pt-4 /* space for mobile hamburger */
          px-4
          min-h-screen
        "
      >
        <Outlet />
      </main>
    </div>
  );
}
