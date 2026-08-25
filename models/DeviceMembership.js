const mongoose = require("mongoose");

const deviceMembershipSchema = new mongoose.Schema(
  {
    device: { type: String, required: true }, // deviceId, e.g. "esp32-01"
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["owner", "member"], default: "member" },
    status: { type: String, enum: ["active", "removed"], default: "active" },
    invitedAt: { type: Date, default: Date.now },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// a user can only have one membership record per device
deviceMembershipSchema.index({ device: 1, user: 1 }, { unique: true });

module.exports = mongoose.model("DeviceMembership", deviceMembershipSchema);
