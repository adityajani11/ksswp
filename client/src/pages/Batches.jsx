import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { runWithSwalLoader } from "../utils/swalLoading";
import { fetchGroupSummaries } from "../utils/groupDirectory";
import {
  promptLoginPasswordForDelete,
  SECURITY_MODAL_OPTIONS,
  withActionPasswordHeader,
} from "../utils/security";

function upsertBatchInList(existingBatches, incomingBatch) {
  if (!incomingBatch?._id) {
    return existingBatches;
  }

  const normalizedId = String(incomingBatch._id);
  const withoutCurrent = existingBatches.filter(
    (batch) => String(batch._id) !== normalizedId,
  );

  return [incomingBatch, ...withoutCurrent];
}

export default function Batches() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [editingBatchId, setEditingBatchId] = useState(null);
  const [openMenuBatchId, setOpenMenuBatchId] = useState(null);

  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);

  const deferredSearch = useDeferredValue(search);
  const deferredGroupSearch = useDeferredValue(groupSearch);
  const isEditMode = Boolean(editingBatchId);

  const resetForm = useCallback(() => {
    setName("");
    setGroupSearch("");
    setSelectedGroupIds([]);
    setEditingBatchId(null);
  }, []);

  const fetchBatches = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/batches");
      setBatches(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setBatches([]);
      Swal.fire("Error", getApiErrorMessage(err, "Failed to load batches"), "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const ensureGroupsLoaded = useCallback(async () => {
    if (groups.length > 0) {
      return;
    }

    try {
      setGroupsLoading(true);
      const groupSummaries = await fetchGroupSummaries();
      setGroups(Array.isArray(groupSummaries) ? groupSummaries : []);
    } catch (err) {
      Swal.fire("Error", getApiErrorMessage(err, "Failed to load groups"), "error");
    } finally {
      setGroupsLoading(false);
    }
  }, [groups.length]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    if (loading || batches.length > 0) {
      return;
    }

    ensureGroupsLoaded();
  }, [loading, batches.length, ensureGroupsLoaded]);

  useEffect(() => {
    const closeMenu = () => setOpenMenuBatchId(null);

    if (openMenuBatchId) {
      window.addEventListener("click", closeMenu);
    }

    return () => {
      window.removeEventListener("click", closeMenu);
    };
  }, [openMenuBatchId]);

  const filteredBatches = useMemo(() => {
    const query = String(deferredSearch || "").trim().toLowerCase();

    if (!query) {
      return batches;
    }

    return batches.filter((batch) =>
      String(batch.name || "").toLowerCase().includes(query),
    );
  }, [batches, deferredSearch]);

  const filteredGroups = useMemo(() => {
    const query = String(deferredGroupSearch || "").trim().toLowerCase();

    if (!query) {
      return groups;
    }

    return groups.filter((group) =>
      String(group.name || "").toLowerCase().includes(query),
    );
  }, [groups, deferredGroupSearch]);

  const selectedGroupSet = useMemo(
    () => new Set(selectedGroupIds.map((groupId) => String(groupId))),
    [selectedGroupIds],
  );

  const allFilteredGroupsSelected =
    filteredGroups.length > 0 &&
    filteredGroups.every((group) => selectedGroupSet.has(String(group._id)));

  const toggleGroupSelection = (groupId) => {
    const normalizedGroupId = String(groupId);

    setSelectedGroupIds((prev) =>
      prev.includes(normalizedGroupId)
        ? prev.filter((id) => id !== normalizedGroupId)
        : [...prev, normalizedGroupId],
    );
  };

  const toggleSelectAllFilteredGroups = () => {
    const filteredGroupIds = filteredGroups.map((group) => String(group._id));
    const filteredGroupSet = new Set(filteredGroupIds);

    setSelectedGroupIds((prev) => {
      const next = new Set(prev.map((groupId) => String(groupId)));

      if (allFilteredGroupsSelected) {
        filteredGroupSet.forEach((groupId) => next.delete(groupId));
      } else {
        filteredGroupIds.forEach((groupId) => next.add(groupId));
      }

      return [...next];
    });
  };

  const openCreateForm = async () => {
    setOpenMenuBatchId(null);
    resetForm();
    setShowForm(true);
    await ensureGroupsLoaded();
  };

  const openEditForm = async (batch) => {
    setOpenMenuBatchId(null);
    await ensureGroupsLoaded();

    setEditingBatchId(String(batch._id));
    setName(String(batch.name || ""));
    setGroupSearch("");
    setSelectedGroupIds((batch.groupIds || []).map((groupId) => String(groupId)));
    setShowForm(true);
  };

  const saveBatch = async () => {
    if (!name.trim()) {
      Swal.fire("Required", "Batch name is required", "warning");
      return;
    }

    try {
      const res = await runWithSwalLoader(
        isEditMode
          ? {
              title: "Updating batch",
              text: "Saving batch changes...",
            }
          : {
              title: "Creating batch",
              text: "Saving the new batch...",
            },
        () =>
          isEditMode
            ? api.put(`/batches/${editingBatchId}`, {
                name: name.trim(),
                groupIds: selectedGroupIds,
              })
            : api.post("/batches", {
                name: name.trim(),
                groupIds: selectedGroupIds,
              }),
      );

      const nextBatch = res.data;
      setBatches((prev) => upsertBatchInList(prev, nextBatch));
      resetForm();
      setShowForm(false);
      Swal.fire(
        isEditMode ? "Updated" : "Created",
        isEditMode ? "Batch updated successfully" : "Batch created successfully",
        "success",
      );
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, isEditMode ? "Failed to update batch" : "Failed to create batch"),
        "error",
      );
    }
  };

  const renameBatch = async (batch) => {
    setOpenMenuBatchId(null);

    const result = await Swal.fire({
      title: "Rename batch",
      input: "text",
      inputValue: String(batch.name || ""),
      inputPlaceholder: "Enter batch name",
      showCancelButton: true,
      confirmButtonText: "Save",
      cancelButtonText: "Cancel",
      inputValidator: (value) => {
        const trimmedValue = String(value || "").trim();
        if (!trimmedValue) {
          return "Batch name is required";
        }
        if (trimmedValue.length > 200) {
          return "Batch name too long";
        }
        return undefined;
      },
    });

    if (!result.isConfirmed) {
      return;
    }

    const nextName = String(result.value || "").trim();
    if (!nextName || nextName === String(batch.name || "").trim()) {
      return;
    }

    try {
      const res = await runWithSwalLoader(
        {
          title: "Renaming batch",
          text: "Updating batch name...",
        },
        () =>
          api.put(`/batches/${batch._id}`, {
            name: nextName,
          }),
      );

      const nextBatch = res.data;
      setBatches((prev) => upsertBatchInList(prev, nextBatch));

      if (String(editingBatchId || "") === String(batch._id)) {
        setName(nextName);
      }

      Swal.fire("Updated", "Batch renamed successfully", "success");
    } catch (err) {
      Swal.fire("Error", getApiErrorMessage(err, "Failed to rename batch"), "error");
    }
  };

  const deleteBatch = async (batch) => {
    setOpenMenuBatchId(null);

    const result = await Swal.fire({
      title: "Delete batch?",
      html: `
        <p>
          Delete <strong>${String(batch.name || "")}</strong>?
        </p>
        <p class="mt-2 text-red-600">
          This will remove only the batch container, not the groups or contacts.
        </p>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
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
      await runWithSwalLoader(
        {
          title: "Deleting batch",
          text: "Removing this batch...",
        },
        () =>
          api.delete(
            `/batches/${batch._id}`,
            withActionPasswordHeader(loginPassword),
          ),
      );

      setBatches((prev) =>
        prev.filter((existingBatch) => String(existingBatch._id) !== String(batch._id)),
      );

      if (String(editingBatchId || "") === String(batch._id)) {
        resetForm();
        setShowForm(false);
      }

      Swal.fire("Deleted", "Batch deleted successfully", "success");
    } catch (err) {
      Swal.fire("Error", getApiErrorMessage(err, "Failed to delete batch"), "error");
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading batches...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Batches</h2>
        {batches.length > 0 && (
          <button
            onClick={() => {
              if (showForm) {
                setShowForm(false);
                resetForm();
                return;
              }

              openCreateForm();
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {showForm ? "Close" : "+ Create Batch"}
          </button>
        )}
      </div>

      {batches.length > 0 && (
        <div className="max-w-md">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search batches..."
            className="w-full border p-2 rounded"
          />
        </div>
      )}

      {(batches.length === 0 || showForm) && (
        <div className="bg-white border rounded shadow p-4 max-w-3xl space-y-4">
          <h3 className="font-semibold">{isEditMode ? "Edit Batch" : "Create Batch"}</h3>

          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 200))}
            placeholder="Enter batch name"
            className="w-full border p-2 rounded"
          />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium text-gray-700">
                Select Groups (optional) ({selectedGroupIds.length} selected)
              </label>
              <button
                type="button"
                onClick={toggleSelectAllFilteredGroups}
                disabled={groupsLoading || filteredGroups.length === 0}
                className="text-sm border px-3 py-1 rounded disabled:opacity-50"
              >
                {allFilteredGroupsSelected ? "Unselect Filtered" : "Select Filtered"}
              </button>
            </div>

            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Search groups..."
              className="w-full border p-2 rounded"
            />

            <div className="border rounded max-h-72 overflow-y-auto">
              {groupsLoading ? (
                <p className="p-3 text-sm text-gray-500">Loading groups...</p>
              ) : filteredGroups.length === 0 ? (
                <p className="p-3 text-sm text-gray-500">
                  No groups available for this search.
                </p>
              ) : (
                filteredGroups.map((group) => (
                  <label
                    key={group._id}
                    className="flex items-center justify-between gap-2 p-3 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedGroupSet.has(String(group._id))}
                        onChange={() => toggleGroupSelection(group._id)}
                      />
                      <span className="font-medium truncate">{group.name}</span>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">
                      {group.contactCount || 0} contacts
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={saveBatch}
              disabled={groupsLoading}
              className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {isEditMode ? "Save Changes" : "Create Batch"}
            </button>
            {showForm && (
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="border px-4 py-2 rounded"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {filteredBatches.length === 0 && batches.length > 0 && (
        <p className="text-gray-500 italic">No batches match your search.</p>
      )}

      {filteredBatches.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredBatches.map((batch) => (
            <div
              key={batch._id}
              className="relative bg-white border rounded shadow hover:shadow-md transition"
            >
              <button
                type="button"
                onClick={() => navigate(`/dashboard/batches/${batch._id}`)}
                className="w-full text-left p-4 pr-14"
              >
                <h4 className="font-semibold text-lg">{batch.name}</h4>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                    {batch.groupCount || 0} Groups
                  </span>
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                    {batch.contactCount || 0} Contacts
                  </span>
                </div>
              </button>

              <div
                className="absolute top-3 right-3"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenMenuBatchId((prev) =>
                      String(prev || "") === String(batch._id) ? null : batch._id,
                    )
                  }
                  className="p-1.5 border rounded hover:bg-gray-50"
                  title="Batch actions"
                >
                  <MoreVertical size={16} />
                </button>

                {String(openMenuBatchId || "") === String(batch._id) && (
                  <div className="absolute right-0 mt-1 w-36 bg-white border rounded shadow-lg z-10 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => renameBatch(batch)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditForm(batch)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBatch(batch)}
                      className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
