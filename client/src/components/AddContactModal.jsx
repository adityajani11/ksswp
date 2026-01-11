import { useState } from "react";
import Swal from "sweetalert2";
import api from "../utils/api";

export default function AddContactModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();

    if (!name.trim() || !phone.trim()) {
      Swal.fire("Required", "Name and phone number are required", "warning");
      return;
    }

    // simple phone validation
    if (!/^\d{10,15}$/.test(phone)) {
      Swal.fire("Invalid", "Enter a valid phone number", "error");
      return;
    }

    try {
      setLoading(true);

      await api.post("/contacts", {
        name: name.trim(),
        phone: phone.trim(),
      });

      Swal.fire({
        icon: "success",
        title: "Contact Added",
        timer: 1200,
        showConfirmButton: false,
      });

      onSaved(); // reload contacts
      onClose(); // close modal
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to add contact",
        "error"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-md rounded-lg shadow-lg p-6 relative">
        <h4 className="text-xl font-bold mb-4">Add New Contact</h4>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Name */}
          <input
            type="text"
            placeholder="Contact Name"
            className="w-full p-3 border rounded focus:outline-none focus:ring mb-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />

          {/* Phone */}
          <input
            type="text"
            placeholder="Phone Number"
            className="w-full p-3 border rounded focus:outline-none focus:ring mt-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={12}
            minLength={12}
          />

          {/* Buttons */}
          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border me-2 hover:bg-gray-100"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
