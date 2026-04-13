import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { runWithSwalLoader } from "../utils/swalLoading";
import { useNavigate } from "react-router-dom";
import {
  fetchGroupsByIds,
  fetchGroupSummaries,
  invalidateGroupDirectoryCache,
  upsertCachedGroup,
} from "../utils/groupDirectory";
import {
  promptLoginPasswordForDelete,
  SECURITY_MODAL_OPTIONS,
  withActionPasswordHeader,
} from "../utils/security";

function getSearchedContactSelectionId(contact) {
  return `${String(contact?.groupId || "")}::${String(contact?.phone || "")}`;
}

function toDisplayPhone(phone) {
  const normalizedPhone = String(phone || "").replace(/^\+/, "").trim();
  return normalizedPhone ? `+${normalizedPhone}` : "";
}

function getContactDisplayLabel(contact) {
  const contactName = String(contact?.name || "").trim();
  const contactPhoneLabel = toDisplayPhone(contact?.phone);

  if (contactName && contactPhoneLabel) {
    return `${contactName} (${contactPhoneLabel})`;
  }

  if (contactName) {
    return contactName;
  }

  if (contactPhoneLabel) {
    return contactPhoneLabel;
  }

  return "Unnamed contact";
}

function summarizeLabels(labels, maxItems = 3) {
  const normalizedLabels = (Array.isArray(labels) ? labels : [])
    .map((label) => String(label || "").trim())
    .filter(Boolean);

  if (!normalizedLabels.length) {
    return "";
  }

  const preview = normalizedLabels.slice(0, maxItems).join(", ");
  const remaining = normalizedLabels.length - maxItems;
  return remaining > 0 ? `${preview}, +${remaining} more` : preview;
}

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [matchingContacts, setMatchingContacts] = useState([]);
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveGroups, setMoveGroups] = useState([]);
  const [moveGroupsLoading, setMoveGroupsLoading] = useState(false);
  const [targetGroupSearch, setTargetGroupSearch] = useState("");
  const [selectedTargetGroupId, setSelectedTargetGroupId] = useState("");
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
      setSelectedContactIds([]);
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

  useEffect(() => {
    const availableIds = new Set(
      matchingContacts.map((contact) => getSearchedContactSelectionId(contact)),
    );

    setSelectedContactIds((prev) => {
      const next = prev.filter((id) => availableIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [matchingContacts]);

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(deferredGroupSearch.toLowerCase()),
  );
  const selectedContactSet = useMemo(
    () => new Set(selectedContactIds),
    [selectedContactIds],
  );
  const selectedContacts = useMemo(
    () =>
      matchingContacts.filter((contact) =>
        selectedContactSet.has(getSearchedContactSelectionId(contact)),
      ),
    [matchingContacts, selectedContactSet],
  );
  const selectedContactSummary = useMemo(
    () => summarizeLabels(selectedContacts.map(getContactDisplayLabel)),
    [selectedContacts],
  );
  const selectedSourceGroupSummary = useMemo(
    () =>
      summarizeLabels(
        [
          ...new Set(
            selectedContacts.map((contact) =>
              String(contact.groupName || "Unknown group"),
            ),
          ),
        ],
        2,
      ) || "selected groups",
    [selectedContacts],
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

  const closeMoveModal = () => {
    setShowMoveModal(false);
    setMoveGroups([]);
    setMoveGroupsLoading(false);
    setTargetGroupSearch("");
    setSelectedTargetGroupId("");
  };

  const updateGroupSummaryFromMove = (nextGroup) => {
    if (!nextGroup?._id) {
      return;
    }

    const normalizedId = String(nextGroup._id);
    const nextContactCount = Array.isArray(nextGroup.contacts)
      ? nextGroup.contacts.length
      : Number(nextGroup.contactCount ?? 0);

    setGroups((prev) =>
      prev.map((group) =>
        String(group._id) === normalizedId
          ? {
              ...group,
              name: String(nextGroup.name || group.name || ""),
              contactCount: nextContactCount,
            }
          : group,
      ),
    );
  };

  const toggleSearchedContactSelection = (contact) => {
    const selectionId = getSearchedContactSelectionId(contact);

    setSelectedContactIds((prev) =>
      prev.includes(selectionId)
        ? prev.filter((id) => id !== selectionId)
        : [...prev, selectionId],
    );
  };

  const openMoveModalForSelected = async () => {
    if (!selectedContacts.length) {
      Swal.fire(
        "No selection",
        "Select at least one contact number to move",
        "warning",
      );
      return;
    }

    setShowMoveModal(true);
    setMoveGroups([]);
    setMoveGroupsLoading(true);
    setTargetGroupSearch("");
    setSelectedTargetGroupId("");

    try {
      const selectedSourceGroupIds = new Set(
        selectedContacts.map((contact) => String(contact.groupId)),
      );
      const summaries = await fetchGroupSummaries();
      const availableGroups = (
        Array.isArray(summaries) ? summaries : []
      ).filter(
        (candidateGroup) =>
          !selectedSourceGroupIds.has(String(candidateGroup._id)),
      );

      if (!availableGroups.length) {
        closeMoveModal();
        Swal.fire(
          "No target group",
          `No eligible target group found for contacts from ${selectedSourceGroupSummary}.`,
          "info",
        );
        return;
      }

      setMoveGroups(availableGroups);
    } catch (err) {
      closeMoveModal();
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to load groups"),
        "error",
      );
    } finally {
      setMoveGroupsLoading(false);
    }
  };

  const moveSelectedSearchedContacts = async () => {
    if (!selectedContacts.length) {
      Swal.fire("No selection", "Select contact numbers to move", "warning");
      return;
    }

    if (!selectedTargetGroupId) {
      Swal.fire(
        "Required",
        `Please choose a target group for contacts from ${selectedSourceGroupSummary}.`,
        "warning",
      );
      return;
    }

    const contactsBySourceGroup = selectedContacts.reduce((acc, contact) => {
      const sourceGroupId = String(contact.groupId);

      if (!acc[sourceGroupId]) {
        acc[sourceGroupId] = [];
      }

      acc[sourceGroupId].push(contact);
      return acc;
    }, {});

    const targetGroupName = String(selectedTargetGroup?.name || "selected group");
    const result = await Swal.fire({
      title: `Move ${selectedContacts.length} contact(s)?`,
      text: selectedContactSummary
        ? `${selectedContactSummary} from ${selectedSourceGroupSummary} will be moved to "${targetGroupName}".`
        : `Selected contacts from ${selectedSourceGroupSummary} will be moved to "${targetGroupName}".`,
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
      let movedCount = 0;
      let skippedCount = 0;
      const movedSelectionIdSet = new Set();

      await runWithSwalLoader(
        {
          title: "Moving contacts",
          text: `Moving ${selectedContacts.length} contact(s) from ${selectedSourceGroupSummary} to "${targetGroupName}"...`,
        },
        async () => {
          for (const [sourceGroupId, contacts] of Object.entries(
            contactsBySourceGroup,
          )) {
            const phones = contacts.map((contact) => String(contact.phone));
            const res = await api.post(`/groups/${sourceGroupId}/contacts/move`, {
              targetGroupId: selectedTargetGroupId,
              phones,
            });

            const payload = res.data || {};
            const movedPhones = Array.isArray(payload.movedPhones)
              ? payload.movedPhones.map((phone) => String(phone || "")).filter(Boolean)
              : [];
            const movedInCall = Math.max(
              0,
              Number(payload.movedCount ?? movedPhones.length) || 0,
            );
            const skippedInCall = Number.isFinite(Number(payload.skippedCount))
              ? Math.max(0, Number(payload.skippedCount))
              : Math.max(0, phones.length - movedPhones.length);

            movedCount += movedInCall;
            skippedCount += skippedInCall;

            movedPhones.forEach((phone) => {
              movedSelectionIdSet.add(`${sourceGroupId}::${phone}`);
            });

            const nextSourceGroup =
              upsertCachedGroup(res.data?.sourceGroup) || res.data?.sourceGroup;
            const nextTargetGroup =
              upsertCachedGroup(res.data?.targetGroup) || res.data?.targetGroup;

            updateGroupSummaryFromMove(nextSourceGroup);
            updateGroupSummaryFromMove(nextTargetGroup);
          }
        },
      );

      setMatchingContacts((prev) =>
        prev.map((contact) =>
          movedSelectionIdSet.has(getSearchedContactSelectionId(contact))
            ? {
                ...contact,
                key: `${selectedTargetGroupId}-${contact.phone}-${contact.name || ""}`,
                groupId: selectedTargetGroupId,
                groupName: targetGroupName,
              }
            : contact,
        ),
      );

      setSelectedContactIds([]);
      closeMoveModal();
      Swal.fire(
        skippedCount > 0 ? "Moved with skips" : "Moved",
        skippedCount > 0
          ? `${movedCount} contact(s) moved from ${selectedSourceGroupSummary} to "${targetGroupName}". ${skippedCount} duplicate contact(s) already existed in "${targetGroupName}" and were skipped.`
          : `${movedCount} contact(s) moved from ${selectedSourceGroupSummary} to "${targetGroupName}".`,
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

  const createGroup = async () => {
    const groupNameToCreate = String(name || "").trim();

    if (!groupNameToCreate) {
      Swal.fire("Required", "Group name is required", "warning");
      return;
    }

    try {
      await runWithSwalLoader(
        {
          title: `Creating "${groupNameToCreate}"`,
          text: `Saving group "${groupNameToCreate}"...`,
        },
        () => api.post("/groups", { name: groupNameToCreate }),
      );

      invalidateGroupDirectoryCache();
      setName("");
      setShowForm(false);
      await fetchGroups({ force: true });

      Swal.fire(
        "Created",
        `Group "${groupNameToCreate}" created successfully.`,
        "success",
      );
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message ||
          `Failed to create group "${groupNameToCreate}"`,
        "error",
      );
    }
  };

  const deleteGroup = async (group) => {
    const count = group.contactCount || 0;
    const groupName = String(group?.name || "Unnamed group");

    const result = await Swal.fire({
      title: `Delete group "${groupName}"?`,
      text: `This will permanently delete ${count} contact${count === 1 ? "" : "s"} in "${groupName}". This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#dc2626",
      ...SECURITY_MODAL_OPTIONS,
    });

    if (!result.isConfirmed) return;

    const loginPassword = await promptLoginPasswordForDelete({
      text: `Delete password is required to delete group "${groupName}".`,
    });
    if (!loginPassword) return;

    try {
      await runWithSwalLoader(
        {
          title: "Deleting group",
          text: `Removing "${groupName}" and its contacts...`,
        },
        () =>
          api.delete(
            `/groups/${group._id}`,
            withActionPasswordHeader(loginPassword),
          ),
      );

      invalidateGroupDirectoryCache();
      await fetchGroups({ force: true });
      Swal.fire(
        "Deleted",
        `Group "${groupName}" deleted successfully.`,
        "success",
      );
    } catch (err) {
      Swal.fire(
        "Error",
        err.response?.data?.message || `Failed to delete group "${groupName}"`,
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-700">
              Contact Search Results
            </h3>

            {selectedContacts.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">
                  {selectedContacts.length} selected
                </span>
                <button
                  type="button"
                  onClick={openMoveModalForSelected}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-semibold"
                >
                  MOVE
                </button>
              </div>
            )}
          </div>

          <div className="bg-white rounded shadow border overflow-hidden">
            {searchingContacts ? (
              <p className="p-3 text-sm text-gray-500">Searching contacts...</p>
            ) : matchingContacts.length === 0 ? (
              <p className="p-3 text-sm text-gray-500">
                No contacts match your search.
              </p>
            ) : (
              matchingContacts.map((contact) => (
                <div
                  key={contact.key}
                  className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedContactSet.has(
                      getSearchedContactSelectionId(contact),
                    )}
                    onChange={() => toggleSearchedContactSelection(contact)}
                    className="h-4 w-4 shrink-0"
                  />

                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/groups/${contact.groupId}`)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="font-medium text-sm truncate">{contact.name}</div>
                    <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2 mt-0.5">
                      <span>+{contact.phone}</span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {contact.groupName}
                      </span>
                    </div>
                  </button>
                </div>
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

      {showMoveModal && selectedContacts.length > 0 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-xl p-4 space-y-3">
            <h3 className="text-lg font-semibold">Move Selected Contacts</h3>

            <div className="rounded border bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <p className="font-medium">
                {selectedContacts.length} contact
                {selectedContacts.length === 1 ? "" : "s"} selected
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Choose a target group for selected contact numbers.
              </p>
            </div>

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
                          setSelectedTargetGroupId(String(targetGroup._id))
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
                onClick={moveSelectedSearchedContacts}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                MOVE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
