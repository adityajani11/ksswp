import { useState } from "react";
import Swal from "sweetalert2";
import api from "../utils/api";
import { runWithSwalLoader } from "../utils/swalLoading";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!username || !password) {
      Swal.fire("Required", "Username and password are required", "warning");
      return;
    }

    try {
      setLoading(true);

      const res = await runWithSwalLoader(
        {
          title: "Logging in",
          text: "Checking your credentials...",
        },
        () =>
          api.post("/auth/login", {
            username,
            password,
          }),
      );

      const token = res.data.token;
      onLogin(token);

      Swal.fire({
        icon: "success",
        title: "Login successful",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (err) {
      Swal.fire(
        "Login Failed",
        err.response?.data?.message || "Invalid credentials",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form-card">
      <div className="space-y-2">
        <h3>Welcome back</h3>
        <p>Sign in to continue managing contacts, campaigns, and settings.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            type="text"
            placeholder="Enter username"
            className="app-field"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="Enter password"
            className="app-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
