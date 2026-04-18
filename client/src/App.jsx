import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import SendMessages from "./pages/SendMessages";
import Groups from "./pages/Groups";
import GroupDetails from "./pages/GroupDetails";
import Batches from "./pages/Batches";
import BatchDetails from "./pages/BatchDetails";
import ProtectedRoute from "./routes/ProtectedRoute";
import SendImageMessages from "./components/SendImageMessages";
import SendVideoMessages from "./components/SendVideoMessages";
import SendPdfMessages from "./components/SendPdfMessages";
import MessageHistory from "./pages/MessageHistory";
import ImportContacts from "./pages/ImportContacts/ImportContacts";
import Settings from "./pages/Settings";
import SuperAdminLogin from "./pages/SuperAdmin/SuperAdminLogin";
import SuperAdminDashboard from "./pages/SuperAdmin/SuperAdminDashboard";

// Added
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* SUPER ADMIN */}
        <Route path="/admin" element={<SuperAdminLogin />} />
        <Route path="/admin/dashboard" element={<SuperAdminDashboard />} />

        {/* LOGIN */}
        <Route path="/" element={<LoginPage />} />

        {/* DASHBOARD */}
        <Route
          path="/dashboard/*"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        >
          <Route index element={<Groups />} />
          <Route path="send" element={<SendMessages />} />
          <Route path="groups" element={<Groups />} />
          <Route path="batches" element={<Batches />} />
          <Route path="batches/:id" element={<BatchDetails />} />
          <Route path="image" element={<SendImageMessages />} />
          <Route path="video" element={<SendVideoMessages />} />
          <Route path="document" element={<SendPdfMessages />} />
          <Route path="history" element={<MessageHistory />} />
          <Route path="import" element={<ImportContacts />} />
          <Route path="settings" element={<Settings />} />
          <Route path="groups/:id" element={<GroupDetails />} />
        </Route>

        {/* FALLBACK PATH */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
