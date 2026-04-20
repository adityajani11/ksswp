import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import api, { getApiErrorMessage } from "../utils/api";
import { fetchGroupSummaries, fetchGroupsByIds } from "../utils/groupDirectory";
import { getContactPhoneValue, toDisplayPhone } from "../utils/phone";

function mergeGroupsById(baseGroups, incomingGroups) {
  const incomingById = new Map(
    incomingGroups.map((group) => [String(group._id), group]),
  );
  const seen = new Set();

  const merged = baseGroups.map((group) => {
    const groupId = String(group._id);
    const incoming = incomingById.get(groupId);
    seen.add(groupId);
    if (!incoming) {
      return group;
    }
    return {
      ...group,
      ...incoming,
      contacts: incoming.contactsLoaded ? incoming.contacts : group.contacts,
      contactsLoaded: group.contactsLoaded || incoming.contactsLoaded,
    };
  });

  for (const [groupId, group] of incomingById) {
    if (!seen.has(groupId)) {
      merged.push(group);
    }
  }

  return merged;
}

function uniqueItems(items) {
  return [...new Set(items)];
}

function removeItem(items, value) {
  return items.filter((item) => item !== value);
}

function filterGroupsByName(groups, search) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) {
    return groups;
  }
  return groups.filter((group) =>
    String(group?.name || "").toLowerCase().includes(query),
  );
}

function buildMobileSearchMatches(groups, mobileSearch) {
  const queryDigits = String(mobileSearch || "").replace(/\D/g, "");
  if (!queryDigits) {
    return [];
  }

  const matchesByPhone = new Map();

  for (const group of Array.isArray(groups) ? groups : []) {
    const groupName = String(group?.name || "").trim();

    for (const contact of Array.isArray(group?.contacts) ? group.contacts : []) {
      const phone = getContactPhoneValue(contact);
      if (!phone) {
        continue;
      }

      const normalizedPhone = phone.replace(/\D/g, "");
      if (!normalizedPhone.includes(queryDigits)) {
        continue;
      }

      const contactName = String(contact?.name || "").trim();

      if (!matchesByPhone.has(phone)) {
        matchesByPhone.set(phone, {
          id: `match-${phone}`,
          phone,
          displayPhone: toDisplayPhone(phone),
          name: contactName,
          groupNames: groupName ? [groupName] : [],
        });
        continue;
      }

      const existing = matchesByPhone.get(phone);
      if (groupName && !existing.groupNames.includes(groupName)) {
        existing.groupNames.push(groupName);
      }

      if (!existing.name && contactName) {
        existing.name = contactName;
      }
    }
  }

  return [...matchesByPhone.values()].sort((a, b) =>
    a.phone.localeCompare(b.phone),
  );
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
      const phone = getContactPhoneValue(contact);
      if (phone && !manuallyDeselectedSet.has(phone)) {
        selectedPhones.add(phone);
      }
    }
  }

  return [...selectedPhones];
}

function buildRecipientsPayload(groups, selectedContacts) {
  const phoneToName = new Map();
  for (const group of groups) {
    if (!Array.isArray(group.contacts)) continue;
    for (const contact of group.contacts) {
      const phone = getContactPhoneValue(contact);
      if (phone) {
        phoneToName.set(phone, String(contact.name || "").trim());
      }
    }
  }

  return uniqueItems(selectedContacts).map((phone) => {
    const name = phoneToName.get(phone) || "";
    return name ? { to: phone, name } : { to: phone };
  });
}

function normalizeBatch(batch) {
  const groupIds = uniqueItems(
    (Array.isArray(batch?.groupIds) ? batch.groupIds : [])
      .map((groupId) => String(groupId || "").trim())
      .filter(Boolean),
  );

  return {
    _id: String(batch?._id || ""),
    name: String(batch?.name || ""),
    groupIds,
    groupCount: Number(batch?.groupCount ?? groupIds.length),
    contactCount: Number(batch?.contactCount ?? 0),
    createdAt: batch?.createdAt || null,
    updatedAt: batch?.updatedAt || null,
  };
}

export default function useRecipientGroups() {
  const [groups, setGroups] = useState([]);
  const [batches, setBatches] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [loadingGroupIds, setLoadingGroupIds] = useState([]);
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [_manuallySelectedGroups, setManuallySelectedGroups] = useState([]);
  const [selectedBatches, setSelectedBatches] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [_manuallyDeselected, setManuallyDeselected] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const [mobileSearchLoading, setMobileSearchLoading] = useState(false);
  const [selectedIndividualContacts, setSelectedIndividualContacts] = useState([]);

  const groupsRef = useRef([]);
  const batchesRef = useRef([]);
  const selectedGroupsRef = useRef([]);
  const manuallySelectedGroupsRef = useRef([]);
  const selectedBatchesRef = useRef([]);
  const selectedContactsRef = useRef([]);
  const manuallyDeselectedRef = useRef([]);
  const selectedIndividualContactsRef = useRef([]);

  const syncGroups = (nextGroups) => {
    groupsRef.current = nextGroups;
    setGroups(nextGroups);
    return nextGroups;
  };

  const syncBatches = (nextBatches) => {
    batchesRef.current = nextBatches;
    setBatches(nextBatches);
    return nextBatches;
  };

  const syncSelectedGroups = (nextSelectedGroups) => {
    selectedGroupsRef.current = nextSelectedGroups;
    setSelectedGroups(nextSelectedGroups);
    return nextSelectedGroups;
  };

  const syncManuallySelectedGroups = (nextManuallySelectedGroups) => {
    manuallySelectedGroupsRef.current = nextManuallySelectedGroups;
    setManuallySelectedGroups(nextManuallySelectedGroups);
    return nextManuallySelectedGroups;
  };

  const syncSelectedBatches = (nextSelectedBatches) => {
    selectedBatchesRef.current = nextSelectedBatches;
    setSelectedBatches(nextSelectedBatches);
    return nextSelectedBatches;
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

  const syncSelectedIndividualContacts = (nextIndividual) => {
    selectedIndividualContactsRef.current = nextIndividual;
    setSelectedIndividualContacts(nextIndividual);
    return nextIndividual;
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

  const ensureBatchesLoaded = async ({ force = false } = {}) => {
    if (batchesRef.current.length && !force) {
      return batchesRef.current;
    }
    setBatchesLoading(true);
    try {
      const res = await api.get("/batches");
      const nextBatches = (Array.isArray(res.data) ? res.data : [])
        .map((batch) => normalizeBatch(batch))
        .filter((batch) => batch._id);
      return syncBatches(nextBatches);
    } catch (err) {
      Swal.fire("Error", getApiErrorMessage(err, "Failed to load batches"), "error");
      return null;
    } finally {
      setBatchesLoading(false);
    }
  };

  const ensureSelectionOptionsLoaded = async () => {
    const [nextGroups] = await Promise.all([
      ensureGroupSummariesLoaded(),
      ensureBatchesLoaded(),
    ]);
    return nextGroups;
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
    nextIndividual = selectedIndividualContactsRef.current,
  ) => {
    const groupContacts = buildSelectedContacts(
      groupsRef.current,
      nextSelectedGroups,
      nextManuallyDeselected,
    );

    const nextSelectedContacts = uniqueItems([...groupContacts, ...nextIndividual]);
    return syncSelectedContacts(nextSelectedContacts);
  };

  const buildSelectedGroupIdsFromSources = (
    nextManuallySelectedGroups = manuallySelectedGroupsRef.current,
    nextSelectedBatches = selectedBatchesRef.current,
  ) => {
    const selectedBatchIdSet = new Set(
      nextSelectedBatches.map((batchId) => String(batchId)),
    );
    const batchGroupIds = [];

    for (const batch of batchesRef.current) {
      if (!selectedBatchIdSet.has(String(batch._id))) {
        continue;
      }
      for (const groupId of batch.groupIds || []) {
        batchGroupIds.push(String(groupId));
      }
    }

    return uniqueItems([
      ...nextManuallySelectedGroups.map((groupId) => String(groupId)),
      ...batchGroupIds,
    ]);
  };

  const applySelectionFromSources = ({
    nextManuallySelectedGroups = manuallySelectedGroupsRef.current,
    nextSelectedBatches = selectedBatchesRef.current,
    nextManuallyDeselected = manuallyDeselectedRef.current,
    resetManuallyDeselected = false,
    expandSelectedGroups = false,
  } = {}) => {
    const nextSelectedGroupIds = buildSelectedGroupIdsFromSources(
      nextManuallySelectedGroups,
      nextSelectedBatches,
    );

    syncManuallySelectedGroups(nextManuallySelectedGroups);
    syncSelectedBatches(nextSelectedBatches);
    syncSelectedGroups(nextSelectedGroupIds);

    const appliedManuallyDeselected = resetManuallyDeselected
      ? []
      : nextManuallyDeselected;

    syncManuallyDeselected(appliedManuallyDeselected);
    recalculateSelectedContacts(nextSelectedGroupIds, appliedManuallyDeselected);

    if (expandSelectedGroups && nextSelectedGroupIds.length) {
      setExpandedGroups((prev) => uniqueItems([...prev, ...nextSelectedGroupIds]));
    }

    return nextSelectedGroupIds;
  };

  const resetSelection = () => {
    syncSelectedGroups([]);
    syncManuallySelectedGroups([]);
    syncSelectedBatches([]);
    syncSelectedContacts([]);
    syncManuallyDeselected([]);
    syncSelectedIndividualContacts([]);
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

    const isManuallySelected = manuallySelectedGroupsRef.current.includes(groupId);
    const nextManuallySelectedGroups = isManuallySelected
      ? removeItem(manuallySelectedGroupsRef.current, groupId)
      : [...manuallySelectedGroupsRef.current, groupId];

    applySelectionFromSources({
      nextManuallySelectedGroups,
      nextSelectedBatches: selectedBatchesRef.current,
    });
  };

  const toggleBatch = async (batch) => {
    const batchId = String(batch._id);
    const batchGroupIds = uniqueItems(
      (batch.groupIds || []).map((groupId) => String(groupId)),
    );
    if (!batchGroupIds.length) {
      return;
    }

    const nextGroups = await ensureGroupDetailsLoaded(batchGroupIds);
    if (!nextGroups) {
      return;
    }

    const isBatchSelected = selectedBatchesRef.current.includes(batchId);
    const nextSelectedBatches = isBatchSelected
      ? removeItem(selectedBatchesRef.current, batchId)
      : [...selectedBatchesRef.current, batchId];

    applySelectionFromSources({
      nextManuallySelectedGroups: manuallySelectedGroupsRef.current,
      nextSelectedBatches,
      expandSelectedGroups: !isBatchSelected,
    });
  };

  const toggleContact = (phone) => {
    const normalizedPhone = String(phone);
    const isSelected = selectedContactsRef.current.includes(normalizedPhone);

    let nextIndividual = selectedIndividualContactsRef.current;
    let nextDeselected = manuallyDeselectedRef.current;

    if (isSelected) {
      // Deselecting: remove from individual and add to manually deselected
      nextIndividual = removeItem(nextIndividual, normalizedPhone);
      nextDeselected = uniqueItems([...nextDeselected, normalizedPhone]);
    } else {
      // Selecting: add to individual and remove from manually deselected
      nextIndividual = uniqueItems([...nextIndividual, normalizedPhone]);
      nextDeselected = removeItem(nextDeselected, normalizedPhone);
    }

    syncSelectedIndividualContacts(nextIndividual);
    syncManuallyDeselected(nextDeselected);
    recalculateSelectedContacts(undefined, nextDeselected, nextIndividual);
  };

  const selectAll = async () => {
    setSelectionLoading(true);
    try {
      const query = String(search || "").trim();
      let groupsToSelect = groupsRef.current;

      if (!groupsToSelect.length) {
        const availableGroups = await ensureGroupSummariesLoaded();
        if (!availableGroups) {
          return;
        }
        groupsToSelect = availableGroups;
      }

      if (query) {
        groupsToSelect = filterGroupsByName(groupsToSelect, query);
      }

      const targetGroupIds = uniqueItems(
        groupsToSelect.map((group) => String(group._id)),
      );

      if (!targetGroupIds.length) {
        resetSelection();
        return;
      }

      const nextGroups = await ensureGroupDetailsLoaded(targetGroupIds);
      if (!nextGroups) {
        return;
      }

      const nextManuallySelectedGroups = uniqueItems([
        ...manuallySelectedGroupsRef.current.map((groupId) => String(groupId)),
        ...targetGroupIds,
      ]);

      applySelectionFromSources({
        nextManuallySelectedGroups,
        nextSelectedBatches: selectedBatchesRef.current,
        resetManuallyDeselected: true,
        expandSelectedGroups: true,
      });
    } catch (err) {
      Swal.fire("Error", getApiErrorMessage(err, "Failed to select contacts"), "error");
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

  const trimmedSearch = String(search || "").trim();

  const visibleGroups = useMemo(() => {
    return filterGroupsByName(groups, trimmedSearch);
  }, [groups, trimmedSearch]);

  const visibleBatches = useMemo(() => {
    return batches;
  }, [batches]);

  const mobileSearchMatches = useMemo(() => {
    return buildMobileSearchMatches(groups, mobileSearch);
  }, [groups, mobileSearch]);

  const selectedIndividualDetails = useMemo(() => {
    if (!selectedIndividualContacts.length) return [];
    // We can reuse buildMobileSearchMatches logic but without filtering by query,
    // or just match from all contacts.
    // actually, let's just use buildMobileSearchMatches with an empty logic or similar
    const allMatches = buildMobileSearchMatches(groups, ""); // This is not efficient as it won't return anything if query is empty
    // Let's implement a quick lookup
    const details = [];
    const phoneSet = new Set(selectedIndividualContacts);
    
    // We already have buildMobileSearchMatches, let's use it with a trick or just simple loop
    for (const group of groups) {
      if (!group.contacts) continue;
      for (const contact of group.contacts) {
        const phone = getContactPhoneValue(contact);
        if (phone && phoneSet.has(phone)) {
          const existing = details.find(d => d.phone === phone);
          if (existing) {
            if (group.name && !existing.groupNames.includes(group.name)) {
              existing.groupNames.push(group.name);
            }
          } else {
            details.push({
              id: `sel-${phone}`,
              phone,
              displayPhone: toDisplayPhone(phone),
              name: contact.name || "",
              groupNames: group.name ? [group.name] : []
            });
          }
        }
      }
    }
    return details;
  }, [groups, selectedIndividualContacts]);

  useEffect(() => {
    const queryDigits = String(mobileSearch || "").replace(/\D/g, "");
    if (!queryDigits) {
      setMobileSearchLoading(false);
      return;
    }
    setMobileSearchLoading(true);

    const allGroupIds = groupsRef.current.map((group) => String(group._id));
    if (!allGroupIds.length) {
      setMobileSearchLoading(false);
      return;
    }

    ensureGroupDetailsLoaded(allGroupIds).finally(() => {
      setMobileSearchLoading(false);
    });
  }, [mobileSearch, groups.length]);

  return {
    groups: visibleGroups,
    batches: visibleBatches,
    mobileSearchMatches,
    groupsLoading,
    batchesLoading,
    mobileSearchLoading,
    selectionLoading,
    selectedGroups,
    selectedBatches,
    selectedContacts,
    selectedIndividualDetails,
    expandedGroups,
    search,
    setSearch,
    mobileSearch,
    setMobileSearch,
    ensureGroupSummariesLoaded,
    ensureBatchesLoaded,
    ensureSelectionOptionsLoaded,
    buildRecipientPayload,
    discardSelection: resetSelection,
    isGroupLoading: (groupId) => loadingGroupIds.includes(String(groupId)),
    toggleContact,
    toggleGroup,
    toggleBatch,
    toggleGroupExpand,
    selectAll,
  };
}
