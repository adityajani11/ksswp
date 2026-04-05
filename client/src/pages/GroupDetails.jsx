import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { useParams } from "react-router-dom";
import api, { getApiErrorMessage } from "../utils/api";
import Swal from "sweetalert2";
import { runWithSwalLoader } from "../utils/swalLoading";
import {
  fetchGroupSummaries,
  upsertCachedGroup,
} from "../utils/groupDirectory";
import {
  createExportGroup,
  exportGroupToExcel,
  exportGroupToPdf,
} from "../utils/groupExport";
import {
  promptLoginPasswordForDelete,
  SECURITY_MODAL_OPTIONS,
  withActionPasswordHeader,
} from "../utils/security";

const PAGE_SIZE = 20;

export default function GroupDetails() {
  const { id } = useParams();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  // search + pagination
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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

  // select + bulk actions
  const [selectedPhones, setSelectedPhones] = useState([]);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveGroups, setMoveGroups] = useState([]);
  const [moveGroupsLoading, setMoveGroupsLoading] = useState(false);
  const [targetGroupSearch, setTargetGroupSearch] = useState("");
  const [selectedTargetGroupId, setSelectedTargetGroupId] = useState("");

  const clearSelection = () => {
    setSelectedPhones([]);
    setShowActionMenu(false);
  };

  /* -------------------- FETCH GROUP -------------------- */
  const fetchGroup = useCallback(async () => {
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
  }, [id]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  useEffect(() => {
    setSelectedPhones([]);
    setShowActionMenu(false);
    setShowMoveModal(false);
    setCurrentPage(1);
  }, [id]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (!selectedPhones.length) {
      setShowActionMenu(false);
    }
  }, [selectedPhones.length]);

  useEffect(() => {
    const closeMenu = () => {
      setShowActionMenu(false);
    };

    if (showActionMenu) {
      window.addEventListener("click", closeMenu);
    }

    return () => {
      window.removeEventListener("click", closeMenu);
    };
  }, [showActionMenu]);

  useEffect(() => {
    const availablePhones = new Set(
      (group?.contacts || []).map((contact) => String(contact.phone)),
    );

    setSelectedPhones((prev) => {
      const next = prev.filter((selectedPhone) =>
        availablePhones.has(selectedPhone),
      );
      return next.length === prev.length ? prev : next;
    });
  }, [group?.contacts]);

  const filteredContacts = useMemo(() => {
    const contacts = Array.isArray(group?.contacts) ? group.contacts : [];
    const normalizedSearch = String(search || "")
      .trim()
      .toLowerCase();
    const phoneSearch = String(search || "").replace(/\D/g, "");

    if (!normalizedSearch) {
      return contacts;
    }

    return contacts.filter((contact) => {
      const contactName = String(contact.name || "").toLowerCase();
      const contactPhone = String(contact.phone || "");
      const matchesName = contactName.includes(normalizedSearch);
      const matchesPhone = phoneSearch
        ? contactPhone.includes(phoneSearch)
        : contactPhone.includes(normalizedSearch);

      return matchesName || matchesPhone;
    });
  }, [group?.contacts, search]);

  const hasContacts = (group?.contacts?.length || 0) > 0;
  const selectedPhoneSet = useMemo(
    () => new Set(selectedPhones),
    [selectedPhones],
  );

  const allFilteredSelected =
    filteredContacts.length > 0 &&
    filteredContacts.every((contact) => selectedPhoneSet.has(contact.phone));

  const totalPages = Math.ceil(filteredContacts.length / PAGE_SIZE);
  const safeCurrentPage =
    totalPages > 0 ? Math.min(currentPage, totalPages) : 1;

  useEffect(() => {
    if (totalPages === 0 && currentPage !== 1) {
      setCurrentPage(1);
      return;
    }

    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedContacts = useMemo(
    () =>
      filteredContacts.slice(
        (safeCurrentPage - 1) * PAGE_SIZE,
        safeCurrentPage * PAGE_SIZE,
      ),
    [filteredContacts, safeCurrentPage],
  );

  const filteredMoveGroups = useMemo(() => {
    const normalizedSearch = String(targetGroupSearch || "")
      .trim()
      .toLowerCase();

    if (!normalizedSearch) {
      return moveGroups;
    }

    return moveGroups.filter((candidateGroup) =>
      String(candidateGroup.name || "")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [moveGroups, targetGroupSearch]);

  const selectedTargetGroup = useMemo(
    () =>
      moveGroups.find(
        (candidateGroup) =>
          String(candidateGroup._id) === String(selectedTargetGroupId),
      ) || null,
    [moveGroups, selectedTargetGroupId],
  );

  const toggleContactSelection = (contactPhone) => {
    const normalizedPhone = String(contactPhone);

    setSelectedPhones((prev) =>
      prev.includes(normalizedPhone)
        ? prev.filter((selectedPhone) => selectedPhone !== normalizedPhone)
        : [...prev, normalizedPhone],
    );
  };

  const toggleSelectAllFiltered = () => {
    const visiblePhones = filteredContacts.map((contact) =>
      String(contact.phone),
    );
    const visiblePhoneSet = new Set(visiblePhones);

    setSelectedPhones((prev) => {
      const next = new Set(prev);

      if (allFilteredSelected) {
        visiblePhoneSet.forEach((visiblePhone) => next.delete(visiblePhone));
      } else {
        visiblePhones.forEach((visiblePhone) => next.add(visiblePhone));
      }

      return [...next];
    });
  };

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
      clearSelection();

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
  const deleteContact = async (contactPhone) => {
    const result = await Swal.fire({
      title: "Delete contact?",
      text: "This contact will be removed from the group.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
      ...SECURITY_MODAL_OPTIONS,
    });

    if (!result.isConfirmed) return;

    const loginPassword = await promptLoginPasswordForDelete();
    if (!loginPassword) return;

    try {
      const res = await runWithSwalLoader(
        {
          title: "Deleting contact",
          text: "Removing the contact from this group...",
        },
        () =>
          api.delete(
            `/groups/${id}/contacts/${contactPhone}`,
            withActionPasswordHeader(loginPassword),
          ),
      );

      const nextGroup = upsertCachedGroup(res.data) || res.data;
      setGroup(nextGroup);
      setSelectedPhones((prev) =>
        prev.filter((selectedPhone) => selectedPhone !== String(contactPhone)),
      );

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

  /* -------------------- BULK DELETE -------------------- */
  const deleteSelectedContacts = async () => {
    const phonesToDelete = [...selectedPhones];

    if (!phonesToDelete.length) {
      Swal.fire("No selection", "Select at least one contact", "warning");
      return;
    }

    const result = await Swal.fire({
      title: "Delete selected contacts?",
      text: `Delete ${phonesToDelete.length} contact(s) from this group.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      confirmButtonColor: "#dc2626",
      ...SECURITY_MODAL_OPTIONS,
    });

    if (!result.isConfirmed) {
      return;
    }

    const loginPassword = await promptLoginPasswordForDelete();
    if (!loginPassword) {
      return;
    }

    try {
      const res = await runWithSwalLoader(
        {
          title: "Deleting contacts",
          text: "Removing selected contacts from this group...",
        },
        () =>
          api.post(`/groups/${id}/contacts/delete`, {
            phones: phonesToDelete,
          }, withActionPasswordHeader(loginPassword)),
      );

      const nextGroup = upsertCachedGroup(res.data?.group) || res.data?.group;
      if (nextGroup) {
        setGroup(nextGroup);
      } else {
        await fetchGroup();
      }

      clearSelection();
      Swal.fire(
        "Deleted",
        `${res.data?.deletedCount || phonesToDelete.length} contact(s) deleted successfully.`,
        "success",
      );
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to delete selected contacts"),
        "error",
      );
    }
  };

  /* -------------------- MOVE CONTACTS -------------------- */
  const openMoveModal = async () => {
    if (!selectedPhones.length) {
      Swal.fire(
        "No selection",
        "Select at least one contact to move",
        "warning",
      );
      return;
    }

    setShowActionMenu(false);
    setShowMoveModal(true);
    setMoveGroups([]);
    setMoveGroupsLoading(true);
    setTargetGroupSearch("");
    setSelectedTargetGroupId("");

    try {
      const summaries = await fetchGroupSummaries();
      const availableGroups = (
        Array.isArray(summaries) ? summaries : []
      ).filter((candidateGroup) => String(candidateGroup._id) !== String(id));

      if (!availableGroups.length) {
        setShowMoveModal(false);
        Swal.fire(
          "No target group",
          "Create another group to move contacts.",
          "info",
        );
        return;
      }

      setMoveGroups(availableGroups);
    } catch (err) {
      setShowMoveModal(false);
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to load groups"),
        "error",
      );
    } finally {
      setMoveGroupsLoading(false);
    }
  };

  const closeMoveModal = () => {
    setShowMoveModal(false);
    setTargetGroupSearch("");
    setSelectedTargetGroupId("");
  };

  const moveSelectedContacts = async () => {
    const phonesToMove = [...selectedPhones];

    if (!phonesToMove.length) {
      Swal.fire(
        "No selection",
        "Select at least one contact to move",
        "warning",
      );
      return;
    }

    if (!selectedTargetGroupId) {
      Swal.fire("Required", "Please choose a target group", "warning");
      return;
    }

    const targetGroupName = selectedTargetGroup?.name || "selected group";
    const result = await Swal.fire({
      title: "Move selected contacts?",
      html: `
        <p>
          Move <strong>${phonesToMove.length} contact(s)</strong> to
          <strong> ${targetGroupName}</strong>?
        </p>
        <p class="mt-2 text-gray-600">
          Contacts will be removed from this group after move.
        </p>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Yes, Move",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#2563eb",
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      const res = await runWithSwalLoader(
        {
          title: "Moving contacts",
          text: `Moving contacts to "${targetGroupName}"...`,
        },
        () =>
          api.post(`/groups/${id}/contacts/move`, {
            targetGroupId: selectedTargetGroupId,
            phones: phonesToMove,
          }),
      );

      const nextSourceGroup =
        upsertCachedGroup(res.data?.sourceGroup) || res.data?.sourceGroup;
      if (res.data?.targetGroup) {
        upsertCachedGroup(res.data.targetGroup);
      }

      if (nextSourceGroup) {
        setGroup(nextSourceGroup);
      } else {
        await fetchGroup();
      }

      clearSelection();
      closeMoveModal();
      Swal.fire(
        "Moved",
        `${res.data?.movedCount || phonesToMove.length} contact(s) moved to "${targetGroupName}".`,
        "success",
      );
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to move selected contacts"),
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
          () => exportGroupToExcel(createExportGroup(group, filteredContacts)),
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
          No contacts found in this group. Click "Add Contact" to create one.
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

      {/* BULK ACTIONS */}
      {hasContacts && (
        <div className="bg-white border rounded p-2.5 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAllFiltered}
              className="h-4 w-4 me-2"
            />
            <span>
              {allFilteredSelected
                ? "Unselect all filtered"
                : "Select all filtered"}{" "}
              ({filteredContacts.length})
            </span>
          </label>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {selectedPhones.length} selected
            </span>
            {selectedPhones.length > 0 && (
              <div
                className="relative"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowActionMenu((prev) => !prev)}
                  className="border rounded p-1.5 hover:bg-gray-100"
                  title="Contact actions"
                >
                  <MoreVertical size={18} />
                </button>

                {showActionMenu && (
                  <div className="absolute right-0 mt-2 w-36 bg-white border rounded shadow z-10 overflow-hidden">
                    <button
                      type="button"
                      onClick={openMoveModal}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Move
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedContacts}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTACTS LIST */}
      {hasContacts && (
        <ul className="space-y-2">
          {paginatedContacts.map((contact) => (
            <li key={contact.phone} className="border p-3 rounded">
              {editingContact === contact.phone ? (
                <div className="flex gap-3 items-start">
                  <input
                    type="checkbox"
                    checked={selectedPhoneSet.has(contact.phone)}
                    onChange={() => toggleContactSelection(contact.phone)}
                    className="mt-2 h-4 w-4"
                  />
                  <div className="space-y-2 flex-1">
                    <input
                      value={editName}
                      onChange={(e) =>
                        setEditName(e.target.value.slice(0, 200))
                      }
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
                </div>
              ) : (
                <div className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedPhoneSet.has(contact.phone)}
                      onChange={() => toggleContactSelection(contact.phone)}
                      className="h-4 w-4"
                    />
                    <div>
                      <div className="font-medium">{contact.name}</div>
                      <div className="text-gray-500">+{contact.phone}</div>
                    </div>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button
                      onClick={() => startEditContact(contact)}
                      className="bg-blue-600 rounded px-2 text-white"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => deleteContact(contact.phone)}
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
            disabled={safeCurrentPage === 1}
            onClick={() => setCurrentPage((page) => page - 1)}
            className="border px-3 py-1 rounded disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-sm text-gray-600">
            Page {safeCurrentPage} of {totalPages}
          </span>

          <button
            disabled={safeCurrentPage === totalPages}
            onClick={() => setCurrentPage((page) => page + 1)}
            className="border px-3 py-1 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {showMoveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-xl p-4 space-y-3">
            <h3 className="text-lg font-semibold">
              Move {selectedPhones.length} Contact
              {selectedPhones.length === 1 ? "" : "s"}
            </h3>

            <input
              type="text"
              value={targetGroupSearch}
              onChange={(e) => setTargetGroupSearch(e.target.value)}
              placeholder="Search target group..."
              className="w-full border p-2 rounded"
            />

            <div className="border rounded max-h-72 overflow-y-auto">
              {moveGroupsLoading ? (
                <p className="p-3 text-sm text-gray-500">Loading groups...</p>
              ) : filteredMoveGroups.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">
                  No groups match your search.
                </p>
              ) : (
                filteredMoveGroups.map((targetGroup) => (
                  <label
                    key={targetGroup._id}
                    className="flex items-center justify-between gap-2 p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="radio"
                        name="targetGroup"
                        checked={
                          String(selectedTargetGroupId) ===
                          String(targetGroup._id)
                        }
                        onChange={() =>
                          setSelectedTargetGroupId(targetGroup._id)
                        }
                      />
                      <span className="font-medium truncate">
                        {targetGroup.name}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">
                      {targetGroup.contactCount || 0} contacts
                    </span>
                  </label>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={closeMoveModal}
                className="border px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedTargetGroupId || moveGroupsLoading}
                onClick={moveSelectedContacts}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                Move Selected
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
