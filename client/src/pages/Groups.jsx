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
  const normalizedPhone = String(phone || "")
    .replace(/^\+/, "")
    .trim();
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
        const summaryMatches = await fetchGroupSummaries({
          search: summarySearch,
        });

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
              const matchesPhone = phoneQuery
                ? contactPhone.includes(phoneQuery)
                : false;
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

    const targetGroupName = String(
      selectedTargetGroup?.name || "selected group",
    );
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
            const res = await api.post(
              `/groups/${sourceGroupId}/contacts/move`,
              {
                targetGroupId: selectedTargetGroupId,
                phones,
              },
            );

            const payload = res.data || {};
            const movedPhones = Array.isArray(payload.movedPhones)
              ? payload.movedPhones
                  .map((phone) => String(phone || ""))
                  .filter(Boolean)
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
          ? `${movedCount} contact(s) moved from ${selectedSourceGroupSummary} to "${targetGroupName}". ${skippedCount} contact(s) were skipped because those numbers already existed in another group.`
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
    return (
      <div className="app-page">
        <div className="app-empty-state">Loading groups...</div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Groups</h1>
        </div>

        {groups.length > 0 && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn btn-primary"
          >
            {showForm ? "Close" : "+ Create Group"}
          </button>
        )}
      </div>

      {groups.length > 0 && (
        <div className="app-search-grid max-w-4xl">
          <input
            type="text"
            placeholder="Search groups..."
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            className="app-field"
          />
          <input
            type="text"
            placeholder="Search contact by name or number..."
            value={contactSearch}
            onChange={(e) => setContactSearch(e.target.value)}
            className="app-field"
          />
        </div>
      )}

      {String(contactSearch || "").trim() && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-700">
              Contact Search Results
            </h3>

            {selectedContacts.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="chip chip-neutral">
                  {selectedContacts.length} selected
                </span>
                <button
                  type="button"
                  onClick={openMoveModalForSelected}
                  className="btn btn-primary btn-sm"
                >
                  Move
                </button>
              </div>
            )}
          </div>

          <div className="app-list">
            {searchingContacts ? (
              <p className="p-4 text-sm text-slate-500">
                Searching contacts...
              </p>
            ) : matchingContacts.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">
                No contacts match your search.
              </p>
            ) : (
              matchingContacts.map((contact) => (
                <div key={contact.key} className="app-list-item">
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
                    onClick={() =>
                      navigate(`/dashboard/groups/${contact.groupId}`)
                    }
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {contact.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                      <span>+{contact.phone}</span>
                      <span className="chip chip-primary">
                        {contact.groupName}
                      </span>
                    </div>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {(groups.length === 0 || showForm) && (
        <section className="app-card app-card-section max-w-xl space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Create Group
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Create a clear group name so it is easy to reuse in campaigns.
            </p>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter group name"
            className="app-field"
          />

          <div className="flex flex-wrap gap-2">
            <button onClick={createGroup} className="btn btn-success">
              Create
            </button>
            {showForm && groups.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      )}

      {filteredGroups.length === 0 && groups.length > 0 && (
        <div className="app-empty-state">No groups match your search.</div>
      )}

      {groups.length > 0 && (
        <div className="app-grid-cards">
          {filteredGroups.map((group) => (
            <div
              key={group._id}
              onClick={() => navigate(`/dashboard/groups/${group._id}`)}
              className="relative cursor-pointer app-card app-card-section transition-transform duration-200 hover:-translate-y-1"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteGroup(group);
                }}
                className="btn btn-danger btn-sm absolute right-4 top-4"
                title="Delete group"
              >
                Delete
              </button>

              <div className="space-y-3 pr-24">
                <h4 className="truncate text-lg font-semibold text-slate-900">
                  {group.name}
                </h4>
                <span className="chip chip-primary">
                  {group.contactCount || 0} contacts
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showMoveModal && selectedContacts.length > 0 && (
        <div className="app-modal-shell">
          <div className="app-overlay" onClick={closeMoveModal} />
          <div className="app-modal">
            <div className="app-modal-header">
              <div>
                <h3 className="app-modal-title">Move Selected Contacts</h3>
                <p className="app-modal-subtitle">
                  Choose a destination group for the selected contacts.
                </p>
              </div>
            </div>

            <div className="app-modal-body">
              <div className="app-inline-note">
                <p className="font-medium">
                  {selectedContacts.length} contact
                  {selectedContacts.length === 1 ? "" : "s"} selected
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Choose a target group for selected contact numbers.
                </p>
              </div>

              <input
                type="text"
                value={targetGroupSearch}
                onChange={(e) => setTargetGroupSearch(e.target.value)}
                placeholder="Search target group..."
                className="app-field"
              />

              <div className="recipient-section">
                <div className="recipient-scroll">
                  {moveGroupsLoading ? (
                    <p className="p-4 text-sm text-slate-500">
                      Loading groups...
                    </p>
                  ) : filteredMoveGroups.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">
                      No groups match your search.
                    </p>
                  ) : (
                    filteredMoveGroups.map((targetGroup) => (
                      <label key={targetGroup._id} className="recipient-choice">
                        <div className="recipient-choice-main">
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
                          <div className="recipient-choice-copy">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {targetGroup.name}
                            </div>
                          </div>
                        </div>
                        <span className="recipient-mini-note shrink-0">
                          {targetGroup.contactCount || 0} contacts
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="app-modal-footer">
              <button
                type="button"
                onClick={closeMoveModal}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedTargetGroupId || moveGroupsLoading}
                onClick={moveSelectedSearchedContacts}
                className="btn btn-primary"
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
