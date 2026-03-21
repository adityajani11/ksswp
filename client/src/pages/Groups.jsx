import { useDeferredValue, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "../utils/api";
import { runWithSwalLoader } from "../utils/swalLoading";
import { useNavigate } from "react-router-dom";
import {
  fetchGroupSummaries,
  invalidateGroupDirectoryCache,
} from "../utils/groupDirectory";

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const deferredSearch = useDeferredValue(search);

  const fetchGroups = async ({ force = false } = {}) => {
    try {
      setLoading(true);
      const nextGroups = await fetchGroupSummaries({ force });
      setGroups(Array.isArray(nextGroups) ? nextGroups : []);
    } catch (err) {
      console.error("Fetch groups failed:", err);
      setGroups([]);
      Swal.fire("Error", "Failed to load groups", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(deferredSearch.toLowerCase()),
  );

  const createGroup = async () => {
    if (!name.trim()) {
      Swal.fire("Required", "Group name is required", "warning");
      return;
    }

    try {
      await runWithSwalLoader(
        {
          title: "Creating group",
          text: "Saving the new group...",
        },
        () => api.post("/groups", { name: name.trim() }),
      );

      invalidateGroupDirectoryCache();
      setName("");
      setShowForm(false);
      await fetchGroups({ force: true });

      Swal.fire("Created", "Group created successfully", "success");
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to create group",
        "error",
      );
    }
  };

  const deleteGroup = async (group) => {
    const count = group.contactCount || 0;

    const result = await Swal.fire({
      title: "Delete group?",
      html: `
        <p class="text-gray-600">
          This will permanently delete
          <strong> ${count} contact${count !== 1 ? "s" : ""}</strong>.
        </p>
        <p class="mt-2 text-red-600 font-semibold">
          This action cannot be undone.
        </p>
      `,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
    });

    if (!result.isConfirmed) return;

    try {
      await runWithSwalLoader(
        {
          title: "Deleting group",
          text: "Removing the group and its contacts...",
        },
        () => api.delete(`/groups/${group._id}`),
      );

      invalidateGroupDirectoryCache();
      await fetchGroups({ force: true });
      Swal.fire("Deleted", "Group deleted successfully", "success");
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || "Failed to delete group",
        "error",
      );
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading groups...</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Groups</h2>

        {groups.length > 0 && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            {showForm ? "Close" : "+ Create Group"}
          </button>
        )}
      </div>

      {/* Search */}
      {groups.length > 0 && (
        <div className="max-w-md">
          <input
            type="text"
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border p-2 rounded"
          />
        </div>
      )}

      {/* Create Group Form */}
      {(groups.length === 0 || showForm) && (
        <div className="bg-white p-4 rounded shadow max-w-md">
          <h3 className="font-semibold mb-2">Create Group</h3>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter group name"
            className="w-full border p-2 rounded mb-3"
          />

          <button
            onClick={createGroup}
            className="bg-green-600 text-white px-4 py-2 rounded"
          >
            Create
          </button>
        </div>
      )}

      {/* No Groups */}
      {filteredGroups.length === 0 && groups.length > 0 && (
        <p className="text-gray-500 italic">No groups match your search.</p>
      )}

      {/* Groups Grid */}
      {groups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredGroups.map((group) => (
            <div
              key={group._id}
              onClick={() => navigate(`/dashboard/groups/${group._id}`)}
              className="
          cursor-pointer
          bg-white
          p-4
          rounded
          shadow
          hover:shadow-md
          transition
          relative
        "
            >
              {/* Delete Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteGroup(group);
                }}
                className="absolute top-3 right-5 bg-red-500 rounded px-2 text-white"
                title="Delete group"
              >
                Delete
              </button>

              <h4 className="font-semibold text-lg">{group.name}</h4>
              <p className="text-sm text-gray-500">
                {group.contactCount || 0} contacts
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
