import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";

function getVisibleContacts(group, query, phoneQuery) {
  const contacts = Array.isArray(group?.contacts) ? group.contacts : [];

  if (!query) {
    return contacts;
  }

  const groupMatches = String(group?.name || "")
    .toLowerCase()
    .includes(query);
  if (groupMatches) {
    return contacts;
  }

  return contacts.filter((contact) => {
    const contactName = String(contact.name || "").toLowerCase();
    const contactPhone = String(contact.phone || "");
    const matchesName = contactName.includes(query);
    const matchesPhone = phoneQuery
      ? contactPhone.includes(phoneQuery)
      : contactPhone.includes(query);

    return matchesName || matchesPhone;
  });
}

export default function BatchDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState([]);

  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = String(deferredSearch || "")
    .trim()
    .toLowerCase();
  const phoneSearch = String(deferredSearch || "").replace(/\D/g, "");

  const handleSearchChange = (e) => {
    setSearch(String(e.target.value || ""));
  };

  const fetchBatch = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/batches/${id}`);
      setBatch(res.data || null);
    } catch (err) {
      setBatch(null);
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to load batch"),
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  useEffect(() => {
    setExpandedGroupIds([]);
    setSearch("");
  }, [id]);

  const filteredGroups = useMemo(() => {
    const groups = Array.isArray(batch?.groups) ? batch.groups : [];

    if (!normalizedSearch) {
      return groups;
    }

    return groups.filter((group) => {
      const groupName = String(group.name || "").toLowerCase();
      if (groupName.includes(normalizedSearch)) {
        return true;
      }

      return (group.contacts || []).some((contact) => {
        const contactName = String(contact.name || "").toLowerCase();
        const contactPhone = String(contact.phone || "");
        const matchesName = contactName.includes(normalizedSearch);
        const matchesPhone = phoneSearch
          ? contactPhone.includes(phoneSearch)
          : contactPhone.includes(normalizedSearch);

        return matchesName || matchesPhone;
      });
    });
  }, [batch?.groups, normalizedSearch, phoneSearch]);

  const allFilteredExpanded =
    filteredGroups.length > 0 &&
    filteredGroups.every((group) =>
      expandedGroupIds.includes(String(group._id)),
    );

  const toggleGroupExpand = (groupId) => {
    const normalizedGroupId = String(groupId);
    setExpandedGroupIds((prev) =>
      prev.includes(normalizedGroupId)
        ? prev.filter((id) => id !== normalizedGroupId)
        : [...prev, normalizedGroupId],
    );
  };

  const toggleExpandAllFiltered = () => {
    const filteredGroupIds = filteredGroups.map((group) => String(group._id));
    setExpandedGroupIds((prev) => {
      const next = new Set(prev.map((groupId) => String(groupId)));

      if (allFilteredExpanded) {
        filteredGroupIds.forEach((groupId) => next.delete(groupId));
      } else {
        filteredGroupIds.forEach((groupId) => next.add(groupId));
      }

      return [...next];
    });
  };

  if (loading) {
    return (
      <div className="app-page">
        <div className="app-empty-state">Loading batch...</div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="app-page">
        <div className="app-empty-state">Batch not found.</div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{batch.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-primary">
            {batch.groupCount || 0} Groups
          </span>
          <span className="chip chip-success">
            {batch.contactCount || 0} Contacts
          </span>
        </div>
      </div>

      {batch.groupCount > 0 && (
        <div className="app-toolbar">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search group or contact..."
            className="app-field w-full md:w-80"
          />
          <button
            type="button"
            onClick={toggleExpandAllFiltered}
            disabled={filteredGroups.length === 0}
            className="btn btn-secondary btn-sm"
          >
            {allFilteredExpanded ? "Collapse Filtered" : "Expand Filtered"}
          </button>
        </div>
      )}

      {batch.groupCount === 0 ? (
        <div className="app-empty-state">
          No groups are linked to this batch.
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="app-empty-state">
          No groups or contacts match your search.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const isExpanded = expandedGroupIds.includes(String(group._id));
            const visibleContacts = getVisibleContacts(
              group,
              normalizedSearch,
              phoneSearch,
            );

            return (
              <div key={group._id} className="app-card">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpand(group._id)}
                      className="btn btn-secondary btn-icon"
                    >
                      {isExpanded ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </button>
                    <h3 className="truncate font-semibold text-slate-900">
                      {group.name}
                    </h3>
                    <span className="chip chip-neutral shrink-0">
                      {group.contactCount || 0} Contacts
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/groups/${group._id}`)}
                    className="btn btn-secondary btn-sm"
                  >
                    Open Group
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200/80 p-4">
                    {visibleContacts.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No contacts for this search.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {visibleContacts.map((contact) => (
                          <div
                            key={`${group._id}-${contact.phone}`}
                            className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3"
                          >
                            <p className="text-sm font-semibold text-slate-900">
                              {contact.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              +{contact.phone}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
