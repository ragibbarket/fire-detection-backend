const mongoose = require("mongoose");

const invitationSchema = new mongoose.Schema(
  {
    device: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    token: { type: String, required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "accepted", "expired"], default: "pending" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invitation", invitationSchema);
