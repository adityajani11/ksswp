const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Group = require("../models/Group");

const LOCAL_PHONE_REGEX = /^\d{10}$/;

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
 * Delete Contact from Group
 */
router.delete("/:groupId/contacts/:phone", async (req, res) => {
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
router.delete("/:id", async (req, res) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  await group.deleteOne();

  res.json({ message: "Group deleted successfully" });
});

module.exports = router;
