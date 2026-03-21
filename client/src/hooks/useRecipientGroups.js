import { useDeferredValue, useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { getApiErrorMessage } from "../utils/api";
import { fetchGroupSummaries, fetchGroupsByIds } from "../utils/groupDirectory";

function mergeGroupsById(baseGroups, incomingGroups) {
  const incomingById = new Map(
    incomingGroups.map((group) => [String(group._id), group]),
  );
  const seen = new Set();

  const merged = baseGroups.map((group) => {
    const incoming = incomingById.get(String(group._id));
    if (!incoming) {
      return group;
    }

    seen.add(String(group._id));

    return {
      ...group,
      ...incoming,
      contacts: incoming.contactsLoaded ? incoming.contacts : group.contacts,
      contactsLoaded: Boolean(incoming.contactsLoaded || group.contactsLoaded),
      contactCount:
        incoming.contactCount ?? group.contactCount ?? incoming.contacts?.length ?? 0,
    };
  });

  for (const group of incomingGroups) {
    if (!seen.has(String(group._id))) {
      merged.push(group);
    }
  }

  return merged;
}

function overlayGroupsById(baseGroups, incomingGroups) {
  const incomingById = new Map(
    incomingGroups.map((group) => [String(group._id), group]),
  );

  return baseGroups.map((group) => {
    const incoming = incomingById.get(String(group._id));
    if (!incoming) {
      return group;
    }

    return {
      ...group,
      ...incoming,
      contacts: incoming.contactsLoaded ? incoming.contacts : group.contacts,
      contactsLoaded: Boolean(incoming.contactsLoaded || group.contactsLoaded),
      contactCount:
        incoming.contactCount ?? group.contactCount ?? incoming.contacts?.length ?? 0,
    };
  });
}

function uniqueItems(items) {
  return [...new Set(items)];
}

function removeItem(items, value) {
  return items.filter((item) => item !== value);
}

function buildSelectedContacts(groups, selectedGroupIds, manuallyDeselected) {
  const selectedGroupIdSet = new Set(selectedGroupIds);
  const manuallyDeselectedSet = new Set(manuallyDeselected);
  const selectedPhones = new Set();

  for (const group of groups) {
    if (!selectedGroupIdSet.has(group._id) || !Array.isArray(group.contacts)) {
      continue;
    }

    for (const contact of group.contacts) {
      if (!manuallyDeselectedSet.has(contact.phone)) {
        selectedPhones.add(contact.phone);
      }
    }
  }

  return [...selectedPhones];
}

function buildRecipientsPayload(groups, selectedContacts) {
  const phoneToName = new Map();

  for (const group of groups) {
    for (const contact of group.contacts || []) {
      if (!phoneToName.has(contact.phone)) {
        phoneToName.set(contact.phone, contact.name || "");
      }
    }
  }

  return uniqueItems(selectedContacts).map((phone) => {
    const name = phoneToName.get(phone) || "";
    return name ? { to: phone, name } : { to: phone };
  });
}

export default function useRecipientGroups() {
  const [groups, setGroups] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loadingGroupIds, setLoadingGroupIds] = useState([]);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [manuallyDeselected, setManuallyDeselected] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [search, setSearch] = useState("");

  const deferredSearch = useDeferredValue(search);
  const groupsRef = useRef([]);
  const selectedGroupsRef = useRef([]);
  const selectedContactsRef = useRef([]);
  const manuallyDeselectedRef = useRef([]);

  const syncGroups = (nextGroups) => {
    groupsRef.current = nextGroups;
    setGroups(nextGroups);
    return nextGroups;
  };

  const syncSelectedGroups = (nextSelectedGroups) => {
    selectedGroupsRef.current = nextSelectedGroups;
    setSelectedGroups(nextSelectedGroups);
    return nextSelectedGroups;
  };

  const syncSelectedContacts = (nextSelectedContacts) => {
    selectedContactsRef.current = nextSelectedContacts;
    setSelectedContacts(nextSelectedContacts);
    return nextSelectedContacts;
  };

  const syncManuallyDeselected = (nextManuallyDeselected) => {
    manuallyDeselectedRef.current = nextManuallyDeselected;
    setManuallyDeselected(nextManuallyDeselected);
    return nextManuallyDeselected;
  };

  const mergeAndStoreGroups = (incomingGroups, { useIncomingOrder = false } = {}) => {
    const nextGroups = useIncomingOrder
      ? mergeGroupsById(incomingGroups, groupsRef.current)
      : mergeGroupsById(groupsRef.current, incomingGroups);

    return syncGroups(nextGroups);
  };

  const ensureGroupSummariesLoaded = async ({ force = false } = {}) => {
    if (groupsRef.current.length && !force) {
      return groupsRef.current;
    }

    setGroupsLoading(true);

    try {
      const summaries = await fetchGroupSummaries({ force });
      return mergeAndStoreGroups(summaries, { useIncomingOrder: true });
    } catch (err) {
      Swal.fire("Error", getApiErrorMessage(err, "Failed to load groups"), "error");
      return null;
    } finally {
      setGroupsLoading(false);
    }
  };

  const ensureGroupDetailsLoaded = async (groupIds, { force = false } = {}) => {
    const uniqueGroupIds = uniqueItems(groupIds.map((groupId) => String(groupId)));
    const missingGroupIds = uniqueGroupIds.filter((groupId) => {
      const existingGroup = groupsRef.current.find((group) => group._id === groupId);
      return force || !existingGroup?.contactsLoaded;
    });

    if (!missingGroupIds.length) {
      return groupsRef.current;
    }

    setLoadingGroupIds((prev) => uniqueItems([...prev, ...missingGroupIds]));

    try {
      const detailedGroups = await fetchGroupsByIds(missingGroupIds, { force });
      return mergeAndStoreGroups(detailedGroups);
    } catch (err) {
      Swal.fire(
        "Error",
        getApiErrorMessage(err, "Failed to load group contacts"),
        "error",
      );
      return null;
    } finally {
      setLoadingGroupIds((prev) =>
        prev.filter((groupId) => !missingGroupIds.includes(groupId)),
      );
    }
  };

  const recalculateSelectedContacts = (
    nextSelectedGroups = selectedGroupsRef.current,
    nextManuallyDeselected = manuallyDeselectedRef.current,
  ) => {
    const nextSelectedContacts = buildSelectedContacts(
      groupsRef.current,
      nextSelectedGroups,
      nextManuallyDeselected,
    );

    return syncSelectedContacts(nextSelectedContacts);
  };

  const resetSelection = () => {
    syncSelectedGroups([]);
    syncSelectedContacts([]);
    syncManuallyDeselected([]);
    setExpandedGroups([]);
  };

  const toggleGroupExpand = async (groupId) => {
    const normalizedGroupId = String(groupId);
    const isExpanded = expandedGroups.includes(normalizedGroupId);

    if (isExpanded) {
      setExpandedGroups((prev) => removeItem(prev, normalizedGroupId));
      return;
    }

    const nextGroups = await ensureGroupDetailsLoaded([normalizedGroupId]);
    if (!nextGroups) {
      return;
    }

    setExpandedGroups((prev) =>
      prev.includes(normalizedGroupId) ? prev : [...prev, normalizedGroupId],
    );
  };

  const toggleGroup = async (group) => {
    const groupId = String(group._id);
    const nextGroups = await ensureGroupDetailsLoaded([groupId]);

    if (!nextGroups) {
      return;
    }

    const isSelected = selectedGroupsRef.current.includes(groupId);
    const nextSelectedGroups = isSelected
      ? removeItem(selectedGroupsRef.current, groupId)
      : [...selectedGroupsRef.current, groupId];

    syncSelectedGroups(nextSelectedGroups);
    recalculateSelectedContacts(nextSelectedGroups);
  };

  const toggleContact = (phone) => {
    const normalizedPhone = String(phone);
    const isSelected = selectedContactsRef.current.includes(normalizedPhone);
    const nextSelectedContacts = isSelected
      ? removeItem(selectedContactsRef.current, normalizedPhone)
      : [...selectedContactsRef.current, normalizedPhone];
    const nextManuallyDeselected = isSelected
      ? [...manuallyDeselectedRef.current, normalizedPhone]
      : removeItem(manuallyDeselectedRef.current, normalizedPhone);

    syncSelectedContacts(nextSelectedContacts);
    syncManuallyDeselected(nextManuallyDeselected);
  };

  const selectAll = async () => {
    const availableGroups = await ensureGroupSummariesLoaded();
    if (!availableGroups) {
      return;
    }

    const allGroupIds = availableGroups.map((group) => group._id);

    setSelectionLoading(true);

    try {
      const nextGroups = await ensureGroupDetailsLoaded(allGroupIds);
      if (!nextGroups) {
        return;
      }

      syncSelectedGroups(allGroupIds);
      syncManuallyDeselected([]);
      setExpandedGroups(allGroupIds);
      recalculateSelectedContacts(allGroupIds, []);
    } finally {
      setSelectionLoading(false);
    }
  };

  const buildRecipientPayload = async () => {
    const nextGroups = await ensureGroupDetailsLoaded(selectedGroupsRef.current);
    if (!nextGroups) {
      return null;
    }

    return buildRecipientsPayload(groupsRef.current, selectedContactsRef.current);
  };

  useEffect(() => {
    const query = String(deferredSearch || "").trim();

    if (!query) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;

    const runSearch = async () => {
      setSearchLoading(true);

      try {
        const summaries = await fetchGroupSummaries({ search: query });
        if (cancelled) {
          return;
        }

        setSearchResults(
          overlayGroupsById(
            summaries,
            groupsRef.current.filter((group) => group.contactsLoaded),
          ),
        );
      } catch (err) {
        if (!cancelled) {
          Swal.fire(
            "Error",
            getApiErrorMessage(err, "Failed to search groups"),
            "error",
          );
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    };

    runSearch();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch]);

  const visibleGroups = String(deferredSearch || "").trim()
    ? searchResults
    : groups;

  return {
    groups: visibleGroups,
    groupsLoading,
    searchLoading,
    selectionLoading,
    selectedGroups,
    selectedContacts,
    expandedGroups,
    search,
    setSearch,
    ensureGroupSummariesLoaded,
    buildRecipientPayload,
    discardSelection: resetSelection,
    isGroupLoading: (groupId) => loadingGroupIds.includes(String(groupId)),
    toggleContact,
    toggleGroup,
    toggleGroupExpand,
    selectAll,
  };
}
