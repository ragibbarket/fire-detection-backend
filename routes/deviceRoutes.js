const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const DeviceMembership = require("../models/DeviceMembership");
const Invitation = require("../models/Invitation");
const { requireAuth, requireDeviceMember, requireDeviceOwner } = require("../middleware/auth");
const { sendInviteEmail } = require("../services/emailService");

const MAX_ACTIVE_USERS_PER_DEVICE = 5; // owner counts as one of the 5

// GET /api/devices/:deviceId/members - any active member can view the team
router.get("/:deviceId/members", requireAuth, requireDeviceMember, async (req, res) => {
  const members = await DeviceMembership.find({ device: req.params.deviceId, status: "active" })
    .populate("user", "name email")
    .sort({ createdAt: 1 });
  res.json(members);
});

// POST /api/devices/:deviceId/invite - OWNER ONLY. Body: { email }
router.post("/:deviceId/invite", requireAuth, requireDeviceOwner, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    const activeCount = await DeviceMembership.countDocuments({ device: deviceId, status: "active" });
    if (activeCount >= MAX_ACTIVE_USERS_PER_DEVICE) {
      return res.status(409).json({
        error: `This device already has the maximum of ${MAX_ACTIVE_USERS_PER_DEVICE} active users. Remove someone first to free a slot.`,
      });
    }

    const token = crypto.randomBytes(20).toString("hex");
    const invitation = await Invitation.create({
      device: deviceId,
      email: email.toLowerCase(),
      token,
      invitedBy: req.user.userId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h to accept
    });

    await sendInviteEmail(invitation);

    res.status(201).json({ success: true, invitedEmail: invitation.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send invitation" });
  }
});

// DELETE /api/devices/:deviceId/members/:userId - OWNER ONLY. Permanent removal;
// their slot immediately becomes available for a new invite.
router.delete("/:deviceId/members/:userId", requireAuth, requireDeviceOwner, async (req, res) => {
  try {
    const { deviceId, userId } = req.params;

    const membership = await DeviceMembership.findOne({ device: deviceId, user: userId, status: "active" });
    if (!membership) return res.status(404).json({ error: "Active member not found" });
    if (membership.role === "owner") {
      return res.status(400).json({ error: "The owner cannot remove themselves" });
    }

    membership.status = "removed";
    membership.removedAt = new Date();
    await membership.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove member" });
  }
});

module.exports = router;
