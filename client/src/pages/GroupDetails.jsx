import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import api, { getApiErrorMessage } from "../utils/api";
import Swal from "sweetalert2";
import { runWithSwalLoader } from "../utils/swalLoading";
import { upsertCachedGroup } from "../utils/groupDirectory";
import {
  createExportGroup,
  exportGroupToExcel,
  exportGroupToPdf,
} from "../utils/groupExport";

export default function GroupDetails() {
  const { id } = useParams();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  // search + pagination
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const PAGE_SIZE = 20; // Can be changed

  // group rename
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");

  // add contact
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // edit contact
  const [editingContact, setEditingContact] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  /* -------------------- FETCH GROUP -------------------- */
  const fetchGroup = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/groups/${id}`);
      const nextGroup = upsertCachedGroup(res.data) || res.data;
      setGroup(nextGroup);
      setGroupName(nextGroup.name);
    } catch {
      Swal.fire("Error", "Group not found", "error");
      setGroup(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroup();
  }, [id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  /* ----------------- CONFIRM DOWNLOAD ----------------- */
  const confirmDownload = async (type, onConfirm) => {
    const result = await Swal.fire({
      title: `Download ${type}?`,
      text: `Do you want to export ${filteredContacts.length} contacts as ${type}?`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Download",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      await onConfirm();
    }
  };

  /* -------------------- ADD CONTACT -------------------- */
  const addContact = async () => {
    if (!name.trim()) {
      Swal.fire("Required", "Name is required", "warning");
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      Swal.fire("Invalid", "Enter valid 10 digit number", "warning");
      return;
    }

    try {
      const res = await runWithSwalLoader(
        {
          title: "Adding contact",
          text: "Saving the contact...",
        },
        () =>
          api.post(`/groups/${id}/contacts`, {
            name: name.trim(),
            phone,
          }),
      );

      const nextGroup = upsertCachedGroup(res.data) || res.data;
      setGroup(nextGroup);
      setName("");
      setPhone("");
      setShowForm(false);

      Swal.fire("Added", "Contact added successfully", "success");
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to add contact",
        "error",
      );
    }
  };

  /* ------------------ DELETE CONTACT -------------------- */
  const deleteContact = async (phone) => {
    const result = await Swal.fire({
      title: "Delete contact?",
      text: "This contact will be removed from the group.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      const res = await runWithSwalLoader(
        {
          title: "Deleting contact",
          text: "Removing the contact from this group...",
        },
        () => api.delete(`/groups/${id}/contacts/${phone}`),
      );

      const nextGroup = upsertCachedGroup(res.data) || res.data;
      setGroup(nextGroup);

      Swal.fire("Deleted", "Contact removed successfully", "success");
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to delete contact",
        "error",
      );
    }
  };

  /* -------------------- RENAME GROUP -------------------- */
  const renameGroup = async () => {
    if (!groupName.trim()) return;

    try {
      const res = await runWithSwalLoader(
        {
          title: "Renaming group",
          text: "Updating the group name...",
        },
        () =>
          api.put(`/groups/${id}`, {
            name: groupName.trim(),
          }),
      );

      const nextGroup = upsertCachedGroup(res.data) || res.data;
      setGroup(nextGroup);
      setGroupName(nextGroup.name);
      setEditingGroup(false);
      Swal.fire("Updated", "Group renamed", "success");
    } catch {
      Swal.fire("Error", "Failed to rename group", "error");
    }
  };

  /* -------------------- EDIT CONTACT -------------------- */
  const startEditContact = (contact) => {
    setEditingContact(contact.phone);
    setEditName(contact.name);
    setEditPhone(contact.phone.slice(2)); // remove 91
  };

  const saveEditContact = async () => {
    if (!editName.trim()) {
      Swal.fire("Required", "Name is required", "warning");
      return;
    }

    if (!/^\d{10}$/.test(editPhone)) {
      Swal.fire("Invalid", "Enter valid 10 digit number", "warning");
      return;
    }

    try {
      const res = await runWithSwalLoader(
        {
          title: "Updating contact",
          text: "Saving contact changes...",
        },
        () =>
          api.put(`/groups/${id}/contacts/${editingContact}`, {
            name: editName.trim(),
            phone: editPhone,
          }),
      );

      const nextGroup = upsertCachedGroup(res.data) || res.data;
      setGroup(nextGroup);
      setEditingContact(null);

      Swal.fire("Updated", "Contact updated", "success");
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to update contact",
        "error",
      );
    }
  };

  /* -------------------- EXPORT EXCEL -------------------- */
  const exportExcel = async () => {
    if (!filteredContacts.length) {
      Swal.fire("No data", "No contacts to export", "warning");
      return;
    }

    try {
      await confirmDownload("Excel", async () => {
        await runWithSwalLoader(
          {
            title: "Exporting Excel",
            text: "Preparing the Excel file...",
          },
          () =>
            exportGroupToExcel(createExportGroup(group, filteredContacts)),
        );
      });
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to export Excel"),
        "error",
      );
    }
  };

  /* -------------------- EXPORT PDF -------------------- */
  const exportPDF = async () => {
    if (!filteredContacts.length) {
      Swal.fire("No data", "No contacts to export", "warning");
      return;
    }

    try {
      await confirmDownload("PDF", async () => {
        await runWithSwalLoader(
          {
            title: "Exporting PDF",
            text: "Preparing the PDF file...",
          },
          () => exportGroupToPdf(createExportGroup(group, filteredContacts)),
        );
      });
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to export PDF"),
        "error",
      );
    }
  };

  /* -------------------- UI STATES -------------------- */
  if (loading) return <p className="text-gray-500">Loading group...</p>;
  if (!group) return <p className="text-gray-500">Group not found.</p>;

  const hasContacts = group.contacts?.length > 0;

  /* ----------------- SEARCH FILTER ----------------- */
  const filteredContacts = group.contacts.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const totalPages = Math.ceil(filteredContacts.length / PAGE_SIZE);

  const paginatedContacts = filteredContacts.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="space-y-6">
      {/* GROUP HEADER */}
      <div className="flex items-center gap-3">
        {editingGroup ? (
          <>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value.slice(0, 200))}
              className="border p-2 rounded"
            />
            <button
              onClick={renameGroup}
              className="bg-green-600 text-white px-3 py-2 rounded"
            >
              Save
            </button>
            <button
              onClick={() => setEditingGroup(false)}
              className="border px-3 py-2 rounded"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold">{group.name}</h2>
            <button
              onClick={() => setEditingGroup(true)}
              className="text-black bg-gray-300 rounded px-2"
            >
              Rename
            </button>
          </>
        )}
      </div>

      {/* EXPORT DATA */}
      <div className="flex gap-2">
        <button
          onClick={exportExcel}
          className="bg-emerald-600 text-white px-4 py-2 rounded"
        >
          Export Excel
        </button>

        <button
          onClick={exportPDF}
          className="bg-red-600 text-white px-4 py-2 rounded"
        >
          Export PDF
        </button>
      </div>

      {/* ADD CONTACT BUTTON */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded mb-3"
        >
          + Add Contact
        </button>
      )}

      {/* ADD CONTACT FORM */}
      {showForm && (
        <div className="bg-white p-4 rounded shadow max-w-md space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 200))}
            placeholder="Contact Name"
            className="w-full border mb-2 p-2 rounded"
          />

          <div className="flex gap-2 items-center">
            <span className="px-3 py-2 border rounded bg-gray-100">+91</span>
            <input
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="10 digit mobile"
              className="flex-1 border p-2 rounded"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={addContact}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Save
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="border px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* EMPTY STATE */}
      {!hasContacts && !showForm && (
        <div className="bg-gray-50 border rounded p-4 text-gray-600">
          No contacts found in this group. Click “Add Contact” to create one.
        </div>
      )}

      {/* SEARCH */}
      <div className="max-w-md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or number"
          className="
      w-full
      border
      p-2
      rounded
      focus:outline-none
      focus:ring-2
      focus:ring-blue-500
    "
        />
      </div>

      {/* CONTACTS LIST */}
      {hasContacts && (
        <ul className="space-y-2">
          {paginatedContacts.map((c) => (
            <li key={c.phone} className="border p-3 rounded">
              {editingContact === c.phone ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value.slice(0, 200))}
                    className="border p-2 rounded w-full mb-2"
                  />
                  <div className="flex gap-2 items-center">
                    <span className="px-3 py-2 border rounded bg-gray-100">
                      +91
                    </span>
                    <input
                      value={editPhone}
                      onChange={(e) =>
                        setEditPhone(
                          e.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                      className="border p-2 rounded flex-1"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEditContact}
                      className="bg-green-600 text-white px-3 py-2 rounded"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingContact(null)}
                      className="border px-3 py-2 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-gray-500">+{c.phone}</div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => startEditContact(c)}
                      className="bg-blue-600 rounded px-2 text-white"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteContact(c.phone)}
                      className="bg-red-500 rounded px-2 text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {filteredContacts.length === 0 && hasContacts && (
        <p className="text-gray-500 italic">No contacts match your search.</p>
      )}

      {totalPages > 1 && (
        <div className="flex gap-2 items-center">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            className="border px-3 py-1 rounded disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>

          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            className="border px-3 py-1 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
