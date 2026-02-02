const express = require("express");
const router = express.Router();
const Group = require("../models/Group");

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
  const groups = await Group.find().sort({ createdAt: -1 });
  res.json(groups);
});

/**
 * Get Group by ID
 */
router.get("/:id", async (req, res) => {
  const group = await Group.findById(req.params.id);

  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  res.json(group);
});

/**
 * Add Contact to Group
 */
router.post("/:groupId/contacts", async (req, res) => {
  const { name, phone } = req.body;
  const { groupId } = req.params;

  if (!name || !phone) {
    return res.status(400).json({ message: "Name and phone are required" });
  }

  if (name.length > 200) {
    return res.status(400).json({ message: "Name too long" });
  }

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ message: "Phone must be 10 digits" });
  }

  const formattedPhone = `91${phone}`;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  const exists = group.contacts.some((c) => c.phone === formattedPhone);

  if (exists) {
    return res.status(409).json({ message: "Contact already exists" });
  }

  group.contacts.push({
    name,
    phone: formattedPhone,
  });

  await group.save();
  res.json(group);
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
  const { name, phone } = req.body;
  const { groupId } = req.params;

  if (!name || name.length > 200) {
    return res.status(400).json({ message: "Invalid name" });
  }

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ message: "Phone must be 10 digits" });
  }

  const formattedPhone = `91${phone}`;

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  const contact = group.contacts.find((c) => c.phone === req.params.phone);

  if (!contact) {
    return res.status(404).json({ message: "Contact not found" });
  }

  // prevent duplicate phone
  const duplicate = group.contacts.some(
    (c) => c.phone === formattedPhone && c.phone !== req.params.phone,
  );

  if (duplicate) {
    return res.status(409).json({ message: "Phone already exists" });
  }

  contact.name = name.trim();
  contact.phone = formattedPhone;

  await group.save();
  res.json(group);
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
