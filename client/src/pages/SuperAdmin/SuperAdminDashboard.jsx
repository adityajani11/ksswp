import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import "./superadmin.css";

export default function SuperAdminDashboard() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const navigate = useNavigate();

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem("superAdminToken");
      if (!token) {
        navigate("/admin");
        return;
      }
      
      const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
      const res = await fetch(`${BASE_URL}/superadmin/users`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.status === 401 || res.status === 403) {
        navigate("/admin");
        return;
      }
      const data = await res.json();
      if (data.success) setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddAdminClick = async () => {
    const { value: formValues } = await Swal.fire({
      title: "Create New Admin",
      html: `
        <input id="swal-input1" class="swal2-input" placeholder="Username" autocomplete="off" style="width: 80%; margin-bottom: 10px;">
        <input id="swal-input2" class="swal2-input" type="password" placeholder="Password" autocomplete="off" style="width: 80%;">
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: "Create Account",
      preConfirm: () => {
        const username = document.getElementById("swal-input1").value.trim();
        const password = document.getElementById("swal-input2").value;
        if (!username || !password) {
          Swal.showValidationMessage("Please enter both username and password");
          return false;
        }
        return { username, password };
      }
    });

    if (formValues) {
      try {
        const token = localStorage.getItem("superAdminToken");
        const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        const res = await fetch(`${BASE_URL}/superadmin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify(formValues)
        });
        const data = await res.json();
        if (data.success) {
          fetchUsers();
          Swal.fire("Success", "Admin created successfully", "success");
        } else {
          Swal.fire("Error", data.message, "error");
        }
      } catch (err) {
        Swal.fire("Error", "Error creating user", "error");
      }
    }
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      const action = currentStatus ? "Deactivate" : "Activate";
      const result = await Swal.fire({
        title: `Are you sure you want to ${action} this user?`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: currentStatus ? "#d33" : "#3085d6",
        cancelButtonColor: "#888",
        confirmButtonText: `Yes, ${action} it!`
      });
      
      if (!result.isConfirmed) return;
      
      const token = localStorage.getItem("superAdminToken");
      const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
      const res = await fetch(`${BASE_URL}/superadmin/users/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ isActive: !currentStatus })
      });
      if (res.ok) fetchUsers();
    } catch (err) {
      Swal.fire("Error", "Error toggling status", "error");
    }
  };

  const handleRename = async (id, currentName) => {
    const { value: newName } = await Swal.fire({
      title: "Enter new display name:",
      input: "text",
      inputValue: currentName,
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) return "You need to write something!";
        if (value === currentName) return "Must be a different name!";
      }
    });

    if (!newName) return;

    try {
      const token = localStorage.getItem("superAdminToken");
      const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
      const res = await fetch(`${BASE_URL}/superadmin/users/${id}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ displayName: newName })
      });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
        Swal.fire("Success", "Display name updated", "success");
      } else {
        Swal.fire("Error", data.message, "error");
      }
    } catch (err) {
      Swal.fire("Error", "Error renaming user", "error");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("superAdminToken");
    navigate("/admin");
  };

  if (loading) return <div className="super-admin-layout" style={{ alignItems: "center", justifyContent: "center" }}>Loading...</div>;

  return (
    <div className="super-admin-layout">
      <header className="sa-header">
        <h1 style={{ fontSize: "1.25rem", margin: 0 }}>Admin Panel</h1>
        <button onClick={handleLogout} className="sa-action-btn sa-logout-btn">
          Logout
        </button>
      </header>

      <main className="sa-container">
        {/* List of admins */}
        <div className="sa-card">
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
            <button onClick={handleAddAdminClick} className="sa-btn" style={{ width: "auto", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
              + Add Admin
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Registered On</th>
                  <th>Updated On</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u._id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: "1rem", color: "var(--wa-primary-dark)" }}>{u.displayName}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--wa-muted)" }}>@{u.username}</div>
                    </td>
                    <td>
                      <span className={`sa-badge ${u.isActive ? 'active' : 'inactive'}`}>
                        {u.isActive ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>{new Date(u.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button onClick={() => handleRename(u._id, u.displayName)} className="sa-action-btn">
                          Rename
                        </button>
                        <button 
                          onClick={() => toggleStatus(u._id, u.isActive)} 
                          className={`sa-action-btn ${u.isActive ? 'danger' : ''}`}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: "center", color: "var(--wa-muted)", padding: "2rem" }}>
                      No admin accounts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
