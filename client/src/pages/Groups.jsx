import { useDeferredValue, useEffect, useState } from "react";
import Swal from "sweetalert2";
import api from "../utils/api";
import { runWithSwalLoader } from "../utils/swalLoading";
import { useNavigate } from "react-router-dom";
import {
  fetchGroupsByIds,
  fetchGroupSummaries,
  invalidateGroupDirectoryCache,
} from "../utils/groupDirectory";

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [matchingContacts, setMatchingContacts] = useState([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const navigate = useNavigate();
  const deferredGroupSearch = useDeferredValue(groupSearch);
  const deferredContactSearch = useDeferredValue(contactSearch);

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

  useEffect(() => {
    const rawQuery = String(deferredContactSearch || "").trim();

    if (!rawQuery) {
      setMatchingContacts([]);
      setSearchingContacts(false);
      return undefined;
    }

    const query = rawQuery.toLowerCase();
    const phoneQuery = rawQuery.replace(/\D/g, "");
    const summarySearch = phoneQuery || rawQuery;
    let cancelled = false;

    const runContactSearch = async () => {
      setSearchingContacts(true);

      try {
        const summaryMatches = await fetchGroupSummaries({ search: summarySearch });

        if (cancelled || !summaryMatches.length) {
          if (!cancelled) {
            setMatchingContacts([]);
          }
          return;
        }

        const detailedGroups = await fetchGroupsByIds(
          summaryMatches.map((group) => group._id),
        );

        if (cancelled) {
          return;
        }

        const nextMatchingContacts = detailedGroups.flatMap((group) =>
          (group.contacts || [])
            .filter((contact) => {
              const contactName = String(contact.name || "").toLowerCase();
              const contactPhone = String(contact.phone || "");
              const matchesName = contactName.includes(query);
              const matchesPhone = phoneQuery ? contactPhone.includes(phoneQuery) : false;
              return matchesName || matchesPhone;
            })
            .map((contact) => ({
              key: `${group._id}-${contact.phone}-${contact.name || ""}`,
              groupId: group._id,
              groupName: group.name || "Unknown group",
              name: contact.name || "Unnamed contact",
              phone: String(contact.phone || ""),
            })),
        );

        setMatchingContacts(nextMatchingContacts);
      } catch (err) {
        if (!cancelled) {
          setMatchingContacts([]);
          Swal.fire(
            "Error",
            err.response?.data?.message || "Failed to search contacts",
            "error",
          );
        }
      } finally {
        if (!cancelled) {
          setSearchingContacts(false);
        }
      }
    };

    runContactSearch();

    return () => {
      cancelled = true;
    };
  }, [deferredContactSearch, groups]);

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(deferredGroupSearch.toLowerCase()),
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl">
          <input
            type="text"
            placeholder="Search groups..."
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            className="w-full border p-2 rounded"
          />
          <input
            type="text"
            placeholder="Search contact by name or number..."
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            className="w-full border p-2 rounded"
          />
        </div>
      )}

      {String(contactSearch || "").trim() && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            Contact Search Results
          </h3>

          <div className="bg-white rounded shadow border overflow-hidden">
            {searchingContacts ? (
              <p className="p-3 text-sm text-gray-500">Searching contacts...</p>
            ) : matchingContacts.length === 0 ? (
              <p className="p-3 text-sm text-gray-500">
                No contacts match your search.
              </p>
            ) : (
              matchingContacts.map((contact) => (
                <button
                  key={contact.key}
                  type="button"
                  onClick={() => navigate(`/dashboard/groups/${contact.groupId}`)}
                  className="w-full p-3 text-left border-b last:border-b-0 hover:bg-gray-50"
                >
                  <div className="font-medium text-sm">{contact.name}</div>
                  <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2 mt-0.5">
                    <span>+{contact.phone}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {contact.groupName}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
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
