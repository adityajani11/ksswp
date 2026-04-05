const mongoose = require("mongoose");

const batchSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    groupIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
        required: true,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

batchSchema.path("groupIds").validate(
  (groupIds) => Array.isArray(groupIds) && groupIds.length > 0,
  "At least one group is required",
);

batchSchema.index({ createdAt: -1 });
batchSchema.index({ name: 1 });

module.exports = mongoose.model("Batch", batchSchema);
