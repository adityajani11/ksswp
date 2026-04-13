const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Group = require("../models/Group");
const auth = require("../middleware/auth");
const requireActionPassword = require("../middleware/requireActionPassword");

const LOCAL_PHONE_REGEX = /^\d{10}$/;
const STORED_PHONE_REGEX = /^91\d{10}$/;

function formatPhone(phone) {
  return `91${String(phone).trim()}`;
}

async function findDuplicatePhoneGroup(phone) {
  return Group.findOne({ "contacts.phone": phone }).select("name").lean();
}

function duplicatePhoneMessage(group) {
  if (group?.name) {
    return `Phone already exists in group "${group.name}"`;
  }

  return "Phone already exists";
}

function isSummaryRequest(req) {
  const summary = String(req.query.summary || "").toLowerCase();
  const includeContacts = String(req.query.includeContacts || "").toLowerCase();

  return (
    summary === "1" ||
    summary === "true" ||
    includeContacts === "0" ||
    includeContacts === "false"
  );
}

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRequestedIds(ids) {
  if (!Array.isArray(ids)) {
    return null;
  }

  const uniqueIds = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
  const hasInvalidId = uniqueIds.some((id) => !mongoose.Types.ObjectId.isValid(id));

  if (hasInvalidId) {
    return null;
  }

  return uniqueIds;
}

function normalizeRequestedPhones(phones) {
  if (!Array.isArray(phones)) {
    return null;
  }

  const uniquePhones = [...new Set(phones.map((phone) => String(phone || "").trim()).filter(Boolean))];
  const hasInvalidPhone = uniquePhones.some((phone) => !STORED_PHONE_REGEX.test(phone));

  if (hasInvalidPhone) {
    return null;
  }

  return uniquePhones;
}

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function applySession(query, session) {
  return session ? query.session(session) : query;
}

async function moveContactsBetweenGroups({
  sourceGroupId,
  targetGroupId,
  phones,
  session = null,
}) {
  if (sourceGroupId === targetGroupId) {
    throw createHttpError(400, "Source and target group cannot be the same");
  }

  const sourceGroup = await applySession(Group.findById(sourceGroupId), session);
  if (!sourceGroup) {
    throw createHttpError(404, "Source group not found");
  }

  const targetGroup = await applySession(Group.findById(targetGroupId), session);
  if (!targetGroup) {
    throw createHttpError(404, "Target group not found");
  }

  const sourceContactByPhone = new Map(
    sourceGroup.contacts.map((contact) => [String(contact.phone), contact]),
  );
  const missingPhones = phones.filter((phone) => !sourceContactByPhone.has(phone));

  if (missingPhones.length) {
    throw createHttpError(404, "One or more contacts no longer exist in source group");
  }

  const targetPhoneSet = new Set(targetGroup.contacts.map((contact) => String(contact.phone)));
  const movedPhones = [];
  const skippedDuplicates = [];

  for (const phone of phones) {
    if (targetPhoneSet.has(phone)) {
      skippedDuplicates.push(phone);
      continue;
    }

    movedPhones.push(phone);
    targetPhoneSet.add(phone);
  }

  const movedPhoneSet = new Set(movedPhones);
  const contactsToMove = movedPhones.map((phone) => sourceContactByPhone.get(phone));

  if (contactsToMove.length > 0) {
    sourceGroup.contacts = sourceGroup.contacts.filter(
      (contact) => !movedPhoneSet.has(String(contact.phone)),
    );
    targetGroup.contacts.push(
      ...contactsToMove.map((contact) => ({
        name: String(contact.name || "").trim(),
        phone: String(contact.phone),
      })),
    );

    await sourceGroup.save({ session });
    await targetGroup.save({ session });
  }

  return {
    sourceGroup,
    targetGroup,
    movedPhones,
    skippedDuplicates,
    skippedCount: skippedDuplicates.length,
    movedCount: contactsToMove.length,
  };
}

function isTransactionUnsupportedError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Transaction numbers are only allowed on a replica set member or mongos") ||
    message.includes("Transaction support is not enabled")
  );
}

/**
 * Create Group
 */
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Group name is required" });
    }

    const group = await Group.create({ name });
    res.status(201).json(group);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Group already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Get All Groups
 */
router.get("/", async (req, res) => {
  try {
    if (isSummaryRequest(req)) {
      const search = String(req.query.search || "").trim();
      const searchRegex = search ? new RegExp(escapeRegex(search), "i") : null;
      const summaryPipeline = [];

      if (searchRegex) {
        summaryPipeline.push({
          $match: {
            $or: [
              { name: searchRegex },
              {
                contacts: {
                  $elemMatch: {
                    $or: [{ name: searchRegex }, { phone: searchRegex }],
                  },
                },
              },
            ],
          },
        });
      }

      summaryPipeline.push(
        {
          $project: {
            name: 1,
            createdAt: 1,
            updatedAt: 1,
            contactCount: {
              $size: {
                $ifNull: ["$contacts", []],
              },
            },
          },
        },
        {
          $sort: {
            createdAt: -1,
            _id: -1,
          },
        },
      );

      const groups = await Group.aggregate(summaryPipeline);

      return res.json(groups);
    }

    const groups = await Group.find()
      .select("name contacts createdAt updatedAt")
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Get Groups in Bulk
 */
router.post("/bulk", async (req, res) => {
  try {
    const ids = normalizeRequestedIds(req.body?.ids);

    if (ids === null) {
      return res.status(400).json({ message: "Invalid group ids" });
    }

    if (!ids.length) {
      return res.json([]);
    }

    const groups = await Group.find({
      _id: { $in: ids },
    })
      .select("name contacts createdAt updatedAt")
      .lean();

    const order = new Map(ids.map((id, index) => [id, index]));
    groups.sort(
      (left, right) =>
        (order.get(String(left._id)) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(String(right._id)) ?? Number.MAX_SAFE_INTEGER),
    );

    res.json(groups);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Get Group by ID
 */
router.get("/:id", async (req, res) => {
  const group = await Group.findById(req.params.id).lean();

  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  res.json(group);
});

/**
 * Add Contact to Group
 */
router.post("/:groupId/contacts", async (req, res) => {
  try {
    const { name, phone } = req.body;
    const { groupId } = req.params;

    if (!name || !phone) {
      return res.status(400).json({ message: "Name and phone are required" });
    }

    if (name.length > 200) {
      return res.status(400).json({ message: "Name too long" });
    }

    if (!LOCAL_PHONE_REGEX.test(phone)) {
      return res.status(400).json({ message: "Phone must be 10 digits" });
    }

    const formattedPhone = formatPhone(phone);

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const duplicateGroup = await findDuplicatePhoneGroup(formattedPhone);
    if (duplicateGroup) {
      return res
        .status(409)
        .json({ message: duplicatePhoneMessage(duplicateGroup) });
    }

    group.contacts.push({
      name: name.trim(),
      phone: formattedPhone,
    });

    await group.save();
    res.json(group);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/* Rename Group Name */
router.put("/:id", async (req, res) => {
  const { name } = req.body;

  if (!name || name.length > 200) {
    return res.status(400).json({ message: "Invalid group name" });
  }

  const group = await Group.findByIdAndUpdate(
    req.params.id,
    { name: name.trim() },
    { new: true },
  );

  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  res.json(group);
});

/* Edit Contact */
router.put("/:groupId/contacts/:phone", async (req, res) => {
  try {
    const { name, phone } = req.body;
    const { groupId } = req.params;

    if (!name || name.length > 200) {
      return res.status(400).json({ message: "Invalid name" });
    }

    if (!LOCAL_PHONE_REGEX.test(phone)) {
      return res.status(400).json({ message: "Phone must be 10 digits" });
    }

    const formattedPhone = formatPhone(phone);

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const contact = group.contacts.find((c) => c.phone === req.params.phone);

    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    if (formattedPhone !== req.params.phone) {
      const duplicateGroup = await findDuplicatePhoneGroup(formattedPhone);
      if (duplicateGroup) {
        return res
          .status(409)
          .json({ message: duplicatePhoneMessage(duplicateGroup) });
      }
    }

    contact.name = name.trim();
    contact.phone = formattedPhone;

    await group.save();
    res.json(group);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Bulk Delete Contacts from Group
 */
router.post("/:groupId/contacts/delete", auth, requireActionPassword, async (req, res) => {
  try {
    const { groupId } = req.params;
    const phones = normalizeRequestedPhones(req.body?.phones);

    if (phones === null || !phones.length) {
      return res.status(400).json({ message: "Valid contact phones are required" });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const existingPhoneSet = new Set(group.contacts.map((contact) => String(contact.phone)));
    const missingPhones = phones.filter((phone) => !existingPhoneSet.has(phone));

    if (missingPhones.length) {
      return res.status(404).json({
        message: "One or more contacts no longer exist in this group",
      });
    }

    const selectedPhoneSet = new Set(phones);
    group.contacts = group.contacts.filter(
      (contact) => !selectedPhoneSet.has(String(contact.phone)),
    );

    await group.save();
    res.json({
      group,
      deletedCount: phones.length,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Move Contacts to Another Group
 */
router.post("/:groupId/contacts/move", async (req, res) => {
  const { groupId } = req.params;
  const targetGroupId = String(req.body?.targetGroupId || "").trim();
  const phones = normalizeRequestedPhones(req.body?.phones);

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ message: "Invalid source group id" });
  }

  if (!mongoose.Types.ObjectId.isValid(targetGroupId)) {
    return res.status(400).json({ message: "Invalid target group id" });
  }

  if (phones === null || !phones.length) {
    return res.status(400).json({ message: "Valid contact phones are required" });
  }

  let session = null;

  try {
    session = await mongoose.startSession();
    let movedResult = null;

    try {
      await session.withTransaction(async () => {
        movedResult = await moveContactsBetweenGroups({
          sourceGroupId: groupId,
          targetGroupId,
          phones,
          session,
        });
      });
    } catch (err) {
      if (!isTransactionUnsupportedError(err)) {
        throw err;
      }

      movedResult = await moveContactsBetweenGroups({
        sourceGroupId: groupId,
        targetGroupId,
        phones,
      });
    }

    res.json({
      movedCount: movedResult.movedCount,
      movedPhones: movedResult.movedPhones,
      skippedCount: movedResult.skippedCount,
      skippedDuplicates: movedResult.skippedDuplicates,
      sourceGroup: movedResult.sourceGroup,
      targetGroup: movedResult.targetGroup,
    });
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ message: err.message });
    }

    res.status(500).json({ message: "Server error" });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

/**
 * Delete Contact from Group
 */
router.delete("/:groupId/contacts/:phone", auth, requireActionPassword, async (req, res) => {
  const { groupId, phone } = req.params;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  const initialLength = group.contacts.length;

  group.contacts = group.contacts.filter((c) => c.phone !== phone);

  if (group.contacts.length === initialLength) {
    return res.status(404).json({ message: "Contact not found" });
  }

  await group.save();
  res.json(group);
});

/**
 * Delete Group
 */
router.delete("/:id", auth, requireActionPassword, async (req, res) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  await group.deleteOne();

  res.json({ message: "Group deleted successfully" });
});

module.exports = router;
