import api from "./api";

let groupSummariesCache = null;
let groupSummariesPromise = null;
const groupDetailsCache = new Map();

function cloneContacts(contacts) {
  return Array.isArray(contacts) ? contacts.map((contact) => ({ ...contact })) : [];
}

function cloneGroup(group) {
  return {
    ...group,
    contacts: group.contactsLoaded ? cloneContacts(group.contacts) : [],
  };
}

function cloneGroups(groups) {
  return groups.map((group) => cloneGroup(group));
}

function normalizeSummaryGroup(group) {
  return {
    _id: String(group._id),
    name: String(group.name || ""),
    contactCount: Number(group.contactCount ?? group.contacts?.length ?? 0),
    createdAt: group.createdAt || null,
    updatedAt: group.updatedAt || null,
    contacts: [],
    contactsLoaded: false,
  };
}

function normalizeDetailedGroup(group) {
  return {
    _id: String(group._id),
    name: String(group.name || ""),
    contactCount: Array.isArray(group.contacts)
      ? group.contacts.length
      : Number(group.contactCount ?? 0),
    createdAt: group.createdAt || null,
    updatedAt: group.updatedAt || null,
    contacts: cloneContacts(group.contacts),
    contactsLoaded: true,
  };
}

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
      contactCount:
        incoming.contactCount ?? group.contactCount ?? incoming.contacts?.length ?? 0,
      contacts: incoming.contactsLoaded ? cloneContacts(incoming.contacts) : group.contacts,
      contactsLoaded: Boolean(incoming.contactsLoaded || group.contactsLoaded),
    };
  });

  for (const group of incomingGroups) {
    if (!seen.has(String(group._id))) {
      merged.push(group);
    }
  }

  return merged;
}

function applyDetailedGroupsToSummaryCache(details) {
  if (!Array.isArray(groupSummariesCache) || !details.length) {
    return;
  }

  groupSummariesCache = mergeGroupsById(
    groupSummariesCache,
    details.map((group) => normalizeSummaryGroup(group)),
  );
}

function storeDetailedGroups(groups) {
  const normalizedGroups = groups.map((group) => normalizeDetailedGroup(group));

  for (const group of normalizedGroups) {
    groupDetailsCache.set(String(group._id), group);
  }

  applyDetailedGroupsToSummaryCache(normalizedGroups);
  return normalizedGroups;
}

export async function fetchGroupSummaries({ force = false, search = "" } = {}) {
  const trimmedSearch = String(search || "").trim();

  if (trimmedSearch) {
    const res = await api.get("/groups", {
      params: {
        summary: "1",
        search: trimmedSearch,
      },
    });

    return res.data.map((group) => normalizeSummaryGroup(group));
  }

  if (groupSummariesCache && !force) {
    return cloneGroups(groupSummariesCache);
  }

  if (!groupSummariesPromise || force) {
    groupSummariesPromise = api
      .get("/groups", {
        params: {
          summary: "1",
        },
      })
      .then((res) => {
        const normalizedGroups = res.data.map((group) =>
          normalizeSummaryGroup(group),
        );

        groupSummariesCache = normalizedGroups;

        return cloneGroups(groupSummariesCache);
      })
      .finally(() => {
        groupSummariesPromise = null;
      });
  }

  return groupSummariesPromise;
}

export async function fetchAllGroupsWithContacts({ force = false } = {}) {
  if (!force && Array.isArray(groupSummariesCache)) {
    if (groupSummariesCache.length === 0) {
      return [];
    }

    const allDetailsLoaded = groupSummariesCache.every((group) =>
      groupDetailsCache.has(String(group._id)),
    );

    if (allDetailsLoaded) {
      return groupSummariesCache
        .map((group) => groupDetailsCache.get(String(group._id)))
        .filter(Boolean)
        .map((group) => cloneGroup(group));
    }
  }

  const res = await api.get("/groups");
  const normalizedGroups = storeDetailedGroups(
    Array.isArray(res.data) ? res.data : [],
  );

  groupSummariesCache = normalizedGroups.map((group) =>
    normalizeSummaryGroup(group),
  );

  return cloneGroups(normalizedGroups);
}

export async function fetchGroupsByIds(ids, { force = false } = {}) {
  const uniqueIds = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];

  if (!uniqueIds.length) {
    return [];
  }

  const missingIds = uniqueIds.filter((id) => force || !groupDetailsCache.has(id));

  if (missingIds.length) {
    const res = await api.post("/groups/bulk", {
      ids: missingIds,
    });

    storeDetailedGroups(Array.isArray(res.data) ? res.data : []);
  }

  return uniqueIds
    .map((id) => groupDetailsCache.get(id))
    .filter(Boolean)
    .map((group) => cloneGroup(group));
}

export function upsertCachedGroup(group) {
  if (!group?._id) {
    return null;
  }

  const normalizedGroup = normalizeDetailedGroup(group);
  groupDetailsCache.set(normalizedGroup._id, normalizedGroup);

  if (Array.isArray(groupSummariesCache)) {
    const summary = normalizeSummaryGroup(normalizedGroup);
    groupSummariesCache = mergeGroupsById(groupSummariesCache, [summary]);
  }

  return cloneGroup(normalizedGroup);
}

export function invalidateGroupDirectoryCache({ groupId } = {}) {
  groupSummariesCache = null;
  groupSummariesPromise = null;

  if (groupId) {
    groupDetailsCache.delete(String(groupId));
    return;
  }

  groupDetailsCache.clear();
}

export function removeGroupFromCache(groupId) {
  if (!groupId) {
    return;
  }

  const normalizedId = String(groupId);
  groupDetailsCache.delete(normalizedId);

  if (Array.isArray(groupSummariesCache)) {
    groupSummariesCache = groupSummariesCache.filter(
      (group) => String(group._id) !== normalizedId,
    );
  }
}
