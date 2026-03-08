import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import SendMessages from "./pages/SendMessages";
import Groups from "./pages/Groups";
import GroupDetails from "./pages/GroupDetails";
import ProtectedRoute from "./routes/ProtectedRoute";
import SendImageMessages from "./components/SendImageMessages";
import SendVideoMessages from "./components/SendVideoMessages";
import SendPdfMessages from "./components/SendPdfMessages";
import MessageHistory from "./pages/MessageHistory";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
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
          <Route path="image" element={<SendImageMessages />} />
          <Route path="video" element={<SendVideoMessages />} />
          <Route path="document" element={<SendPdfMessages />} />
          <Route path="history" element={<MessageHistory />} />
          <Route path="groups/:id" element={<GroupDetails />} />
        </Route>

        {/* FALLBACK PATH */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
