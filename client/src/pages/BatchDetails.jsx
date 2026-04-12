import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";

function getVisibleContacts(group, query, phoneQuery) {
  const contacts = Array.isArray(group?.contacts) ? group.contacts : [];

  if (!query) {
    return contacts;
  }

  const groupMatches = String(group?.name || "").toLowerCase().includes(query);
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
  const normalizedSearch = String(deferredSearch || "").trim().toLowerCase();
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
      Swal.fire("Error", getApiErrorMessage(err, "Failed to load batch"), "error");
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
    filteredGroups.every((group) => expandedGroupIds.includes(String(group._id)));

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
    return <p className="text-gray-500">Loading batch...</p>;
  }

  if (!batch) {
    return <p className="text-gray-500">Batch not found.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">{batch.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
            {batch.groupCount || 0} Groups
          </span>
          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
            {batch.contactCount || 0} Contacts
          </span>
        </div>
      </div>

      {batch.groupCount > 0 && (
        <div className="bg-white border rounded p-3 flex flex-wrap items-center justify-between gap-2">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search group or contact..."
            className="w-full md:w-80 border p-2 rounded"
          />
          <button
            type="button"
            onClick={toggleExpandAllFiltered}
            disabled={filteredGroups.length === 0}
            className="border px-3 py-2 rounded text-sm disabled:opacity-50"
          >
            {allFilteredExpanded ? "Collapse Filtered" : "Expand Filtered"}
          </button>
        </div>
      )}

      {batch.groupCount === 0 ? (
        <div className="bg-gray-50 border rounded p-4 text-gray-600">
          No groups are linked to this batch.
        </div>
      ) : filteredGroups.length === 0 ? (
        <p className="text-gray-500 italic">No groups or contacts match your search.</p>
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
              <div key={group._id} className="bg-white border rounded">
                <div className="p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpand(group._id)}
                      className="text-gray-500"
                    >
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <h3 className="font-semibold truncate">{group.name}</h3>
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full shrink-0">
                      {group.contactCount || 0} Contacts
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/groups/${group._id}`)}
                    className="text-sm border px-3 py-1.5 rounded"
                  >
                    Open Group
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t p-3">
                    {visibleContacts.length === 0 ? (
                      <p className="text-sm text-gray-500">No contacts for this search.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {visibleContacts.map((contact) => (
                          <div
                            key={`${group._id}-${contact.phone}`}
                            className="border rounded p-2 bg-gray-50"
                          >
                            <p className="font-medium text-sm">{contact.name}</p>
                            <p className="text-xs text-gray-600">+{contact.phone}</p>
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
