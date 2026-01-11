import { useState } from "react";
import Swal from "sweetalert2";
import api from "../utils/api";

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

      const res = await api.post("/auth/login", {
        username,
        password,
      });

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
    <div className="w-full max-w-md bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-2xl font-bold text-center mb-6">
        Whatsapp Panel Login
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Username */}
        <input
          type="text"
          placeholder="Username"
          className="w-full p-3 border rounded focus:outline-none focus:ring"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        {/* Password */}
        <input
          type="password"
          placeholder="Password"
          className="w-full p-3 border rounded focus:outline-none focus:ring my-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white p-2 mx-auto rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
