const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const Verifier = require("../models/Verifier");
const Reading = require("../models/Reading");

// GET /api/verify/:alertId?token=xxx - fetch alert details for the review screen
router.get("/:alertId", async (req, res) => {
  const { token } = req.query;
  const alert = await Alert.findById(req.params.alertId).populate("reading");

  if (!alert) return res.status(404).json({ error: "Alert not found" });
  if (alert.verificationToken !== token) return res.status(403).json({ error: "Invalid or expired link" });
  if (alert.verificationExpiresAt < new Date()) return res.status(410).json({ error: "This link has expired" });
  if (alert.status !== "pending_verification") {
    return res.status(409).json({ error: "This alert has already been reviewed", alert });
  }

  res.json({ alert });
});

// POST /api/verify/:alertId - body: { token, decision: "confirmed" | "false_alarm", verifierEmail }
router.post("/:alertId", async (req, res) => {
  try {
    const { token, decision, verifierEmail } = req.body;
    const alert = await Alert.findById(req.params.alertId);

    if (!alert) return res.status(404).json({ error: "Alert not found" });
    if (alert.verificationToken !== token) return res.status(403).json({ error: "Invalid or expired link" });
    if (alert.status !== "pending_verification") {
      return res.status(409).json({ error: "This alert has already been reviewed" });
    }

    const verifier = await Verifier.findOne({ email: verifierEmail });

    alert.status = decision === "confirmed" ? "verified_fire" : "false_alarm";
    alert.verifiedBy = verifier ? verifier._id : null;
    alert.verifiedAt = new Date();
    await alert.save();

    await Reading.findByIdAndUpdate(alert.reading, {
      humanLabel: decision === "confirmed" ? "fire" : "false_alarm",
      humanLabeledAt: alert.verifiedAt,
    });

    const populatedAlert = await Alert.findById(alert._id).populate("reading");

    const io = req.app.get("io");
    io.emit("alert:verified", populatedAlert);

    res.json({ success: true, alert: populatedAlert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record verification" });
  }
});

module.exports = router;
