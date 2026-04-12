const express = require("express");
const mongoose = require("mongoose");
const Batch = require("../models/Batch");
const Group = require("../models/Group");
const auth = require("../middleware/auth");
const requireActionPassword = require("../middleware/requireActionPassword");

const router = express.Router();

function escapeRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeGroupIds(groupIds) {
  if (!Array.isArray(groupIds)) {
    return null;
  }

  const uniqueGroupIds = [...new Set(groupIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const hasInvalidGroupId = uniqueGroupIds.some(
    (id) => !mongoose.Types.ObjectId.isValid(id),
  );

  if (hasInvalidGroupId) {
    return null;
  }

  return uniqueGroupIds;
}

function createBatchListPipeline({ search = "" } = {}) {
  const trimmedSearch = String(search || "").trim();
  const searchRegex = trimmedSearch ? new RegExp(escapeRegex(trimmedSearch), "i") : null;

  const pipeline = [
    {
      $lookup: {
        from: "groups",
        localField: "groupIds",
        foreignField: "_id",
        as: "groupsData",
      },
    },
  ];

  if (searchRegex) {
    pipeline.push({
      $match: {
        $or: [{ name: searchRegex }, { "groupsData.name": searchRegex }],
      },
    });
  }

  pipeline.push(
    {
      $addFields: {
        groupCount: {
          $size: { $ifNull: ["$groupsData", []] },
        },
        contactCount: {
          $sum: {
            $map: {
              input: { $ifNull: ["$groupsData", []] },
              as: "group",
              in: {
                $size: { $ifNull: ["$$group.contacts", []] },
              },
            },
          },
        },
      },
    },
    {
      $project: {
        name: 1,
        groupIds: 1,
        groupCount: 1,
        contactCount: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    {
      $sort: {
        createdAt: -1,
        _id: -1,
      },
    },
  );

  return pipeline;
}

async function getBatchSummary(batchId) {
  const [batch] = await Batch.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(String(batchId)),
      },
    },
    ...createBatchListPipeline(),
  ]);

  return batch || null;
}

/**
 * Create Batch
 */
router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const groupIds = normalizeGroupIds(req.body?.groupIds);

    if (!name) {
      return res.status(400).json({ message: "Batch name is required" });
    }

    if (name.length > 200) {
      return res.status(400).json({ message: "Batch name too long" });
    }

    if (groupIds === null) {
      return res.status(400).json({ message: "Invalid group ids" });
    }

    if (groupIds.length) {
      const existingGroupsCount = await Group.countDocuments({
        _id: { $in: groupIds },
      });

      if (existingGroupsCount !== groupIds.length) {
        return res.status(404).json({ message: "One or more groups were not found" });
      }
    }

    const createdBatch = await Batch.create({
      name,
      groupIds,
    });

    const batchSummary = await getBatchSummary(createdBatch._id);

    res.status(201).json(batchSummary || createdBatch);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Get All Batches
 */
router.get("/", async (req, res) => {
  try {
    const batches = await Batch.aggregate(
      createBatchListPipeline({
        search: req.query.search,
      }),
    );

    res.json(batches);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Update Batch
 */
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid batch id" });
    }

    const body = req.body || {};
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const hasGroupIds = Object.prototype.hasOwnProperty.call(body, "groupIds");

    if (!hasName && !hasGroupIds) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const updatePayload = {};

    if (hasName) {
      const name = String(body.name || "").trim();

      if (!name) {
        return res.status(400).json({ message: "Batch name is required" });
      }

      if (name.length > 200) {
        return res.status(400).json({ message: "Batch name too long" });
      }

      updatePayload.name = name;
    }

    if (hasGroupIds) {
      const groupIds = normalizeGroupIds(body.groupIds);

      if (groupIds === null) {
        return res.status(400).json({ message: "Invalid group ids" });
      }

      if (groupIds.length) {
        const existingGroupsCount = await Group.countDocuments({
          _id: { $in: groupIds },
        });

        if (existingGroupsCount !== groupIds.length) {
          return res.status(404).json({ message: "One or more groups were not found" });
        }
      }

      updatePayload.groupIds = groupIds;
    }

    const updatedBatch = await Batch.findByIdAndUpdate(
      req.params.id,
      updatePayload,
      { new: true },
    );

    if (!updatedBatch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const batchSummary = await getBatchSummary(updatedBatch._id);

    res.json(batchSummary || updatedBatch);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Delete Batch
 */
router.delete("/:id", auth, requireActionPassword, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid batch id" });
    }

    const deletedBatch = await Batch.findByIdAndDelete(req.params.id);

    if (!deletedBatch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    res.json({ message: "Batch deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * Get Batch by ID
 */
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid batch id" });
    }

    const [batch] = await Batch.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(String(req.params.id)),
        },
      },
      {
        $lookup: {
          from: "groups",
          localField: "groupIds",
          foreignField: "_id",
          as: "groupsData",
        },
      },
      {
        $addFields: {
          groupCount: {
            $size: { $ifNull: ["$groupsData", []] },
          },
          contactCount: {
            $sum: {
              $map: {
                input: { $ifNull: ["$groupsData", []] },
                as: "group",
                in: {
                  $size: { $ifNull: ["$$group.contacts", []] },
                },
              },
            },
          },
          groups: {
            $map: {
              input: { $ifNull: ["$groupsData", []] },
              as: "group",
              in: {
                _id: "$$group._id",
                name: "$$group.name",
                contactCount: {
                  $size: { $ifNull: ["$$group.contacts", []] },
                },
                contacts: { $ifNull: ["$$group.contacts", []] },
                createdAt: "$$group.createdAt",
                updatedAt: "$$group.updatedAt",
              },
            },
          },
        },
      },
      {
        $project: {
          name: 1,
          groupIds: 1,
          groupCount: 1,
          contactCount: 1,
          groups: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    batch.groups = (batch.groups || []).sort((left, right) =>
      String(left.name || "").localeCompare(String(right.name || "")),
    );

    res.json(batch);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
