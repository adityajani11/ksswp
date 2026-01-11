import Login from "../components/Login";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();

  const handleLogin = (token) => {
    localStorage.setItem("token", token);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <Login onLogin={handleLogin} />
    </div>
  );
}
