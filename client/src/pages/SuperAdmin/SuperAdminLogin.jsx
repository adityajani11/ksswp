import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./superadmin.css";

export default function SuperAdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(null);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
      const res = await fetch(`${BASE_URL}/superadmin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      const rateLimitRemaining = res.headers.get("RateLimit-Remaining");
      if (rateLimitRemaining) {
        setRemainingAttempts(rateLimitRemaining);
      }

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || "Login failed");
      }
      
      localStorage.setItem("superAdminToken", data.token);
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="super-admin-layout" style={{ justifyContent: "center", alignItems: "center" }}>
      <div className="sa-card" style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h2 style={{ color: "var(--wa-primary-ink)" }}>Admin Panel</h2>
        </div>
        
        {error && (
          <div style={{ background: "rgba(214, 69, 69, 0.1)", color: "var(--wa-danger)", padding: "1rem", borderRadius: "8px", marginBottom: "1rem", textAlign: "center", fontSize: "0.875rem" }}>
            {error}
            {remainingAttempts !== null && (
              <div style={{ marginTop: "0.5rem", fontWeight: "bold" }}>
                Attempts remaining: {remainingAttempts}/5
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="sa-input-group">
            <label>Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
            />
          </div>
          <div className="sa-input-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
            />
          </div>
          <button type="submit" className="sa-btn" disabled={loading} style={{ marginTop: "1rem" }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
