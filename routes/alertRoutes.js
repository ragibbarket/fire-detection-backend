const express = require("express");
const router = express.Router();
const Alert = require("../models/Alert");
const Verifier = require("../models/Verifier");
const Reading = require("../models/Reading");

// GET /api/alerts - alert history for dashboard, most recent first
router.get("/", async (req, res) => {
  const alerts = await Alert.find().sort({ createdAt: -1 }).populate("reading").populate("notifiedStation");
  res.json(alerts);
});

// GET /api/alerts/status?deviceId=esp32-01
// Lightweight endpoint for the ESP32 to POLL (every few seconds).
//
// buzzerShouldSound is computed server-side so the ESP32 just needs to
// read one boolean - no verification-flow knowledge needed on the device:
//   - TRUE the moment the latest reading's ML prediction is "fire" -
//     no human verification required for the buzzer (verification is
//     still required before a fire station gets WhatsApp'd, that flow
//     is unchanged - this only affects the local alarm).
//   - FALSE automatically once a later, normal reading comes in (ML
//     prediction back to false_alarm) - this is why we always look at
//     the LATEST reading, not just "was there ever a fire alert".
//   - FALSE if a human marked the alert tied to that reading as a false
//     alarm (dashboard-verify) - immediate override.
//   - FALSE if a human resolved the alert (Resolve button) after
//     confirming it was real - manual override once they've responded.
// IMPORTANT: must be registered BEFORE "/:id" (same reason as training-data).
router.get("/status", async (req, res) => {
  try {
    const { deviceId } = req.query;
    if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

    const latestReading = await Reading.findOne({ deviceId }).sort({ createdAt: -1 });
    if (!latestReading) {
      return res.json({ status: null, mlPrediction: null, buzzerShouldSound: false });
    }

    const alert = await Alert.findOne({ reading: latestReading._id });

    let buzzerShouldSound = latestReading.mlPrediction === "fire";
    if (alert && (alert.status === "false_alarm" || alert.status === "resolved")) {
      buzzerShouldSound = false;
    }

    res.json({
      status: alert ? alert.status : null,
      mlPrediction: latestReading.mlPrediction,
      buzzerShouldSound,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch alert status" });
  }
});

// GET /api/alerts/training-data
// Exports every reading with a HUMAN-SET GROUND TRUTH LABEL as a labeled
// dataset for the ML service to retrain on. This is intentionally NOT
// scoped to "alerts that got verified" - a reading only becomes an Alert
// if it crosses the basic suspicion threshold or the ML already thinks
// it's fire, so a small real test (e.g. a lighter held to the flame
// sensor, flame=true but smoke/temp too low to look "suspicious") would
// never get an Alert and therefore never get corrected. Reading.humanLabel
// can be set two ways, both count here:
//   1. Verifying an Alert (dashboard or email link) also stamps the label
//      onto its linked reading.
//   2. POST /api/sensor-data/:readingId/label - direct manual labeling of
//      ANY reading, used specifically for that small-scale-test gap above.
router.get("/training-data", async (req, res) => {
  const readings = await Reading.find({ humanLabel: { $ne: null } }).select(
    "flameDetected smokeValue temperature humidity humanLabel humanLabeledAt"
  );

  const rows = readings.map((r) => ({
    flameDetected: r.flameDetected,
    smokeValue: r.smokeValue,
    temperature: r.temperature,
    humidity: r.humidity,
    label: r.humanLabel,
    verifiedAt: r.humanLabeledAt,
  }));

  res.json({ count: rows.length, rows });
});

// GET /api/alerts/:id
router.get("/:id", async (req, res) => {
  const alert = await Alert.findById(req.params.id).populate("reading").populate("notifiedStation");
  if (!alert) return res.status(404).json({ error: "Alert not found" });
  res.json(alert);
});

// POST /api/alerts/:id/dashboard-verify
// Body: { decision: "confirmed" | "false_alarm", verifierEmail }
//
// This is the web-dashboard equivalent of the email-link verify flow
// (routes/verifyRoutes.js). It skips the token check because it's meant
// to be used by staff directly on the monitoring dashboard, not from an
// emailed link - but it still requires picking WHO is verifying
// (verifierEmail, matched against the Verifier collection) so there's an
// accountable human decision on record before a fire station gets notified.
router.post("/:id/dashboard-verify", async (req, res) => {
  try {
    const { decision, verifierEmail } = req.body;

    if (!["confirmed", "false_alarm"].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'confirmed' or 'false_alarm'" });
    }

    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    if (alert.status !== "pending_verification") {
      return res.status(409).json({ error: "This alert is not awaiting verification" });
    }

    const verifier = verifierEmail ? await Verifier.findOne({ email: verifierEmail }) : null;

    alert.status = decision === "confirmed" ? "verified_fire" : "false_alarm";
    alert.verifiedBy = verifier ? verifier._id : null;
    alert.verifiedAt = new Date();
    await alert.save();

    // stamp the same ground truth onto the linked reading, so
    // /training-data picks it up regardless of which path set it
    await Reading.findByIdAndUpdate(alert.reading, {
      humanLabel: decision === "confirmed" ? "fire" : "false_alarm",
      humanLabeledAt: alert.verifiedAt,
    });

    // re-fetch populated so the frontend keeps the reading data it already had
    const populatedAlert = await Alert.findById(alert._id).populate("reading").populate("notifiedStation");

    const io = req.app.get("io");
    io.emit("alert:verified", populatedAlert);

    res.json({ success: true, alert: populatedAlert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record verification" });
  }
});

// POST /api/alerts/:id/resolve
// Manual override, only available after a human confirmed real fire
// (status "verified_fire" or "notified"). Silences the buzzer immediately
// via the /status polling endpoint - use once the situation is actually
// handled. If the next reading is still fire-like, a new alert will
// naturally re-trigger the buzzer (this doesn't disable the device).
router.post("/:id/resolve", async (req, res) => {
  try {
    const alert = await Alert.findById(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    if (!["verified_fire", "notified"].includes(alert.status)) {
      return res.status(409).json({ error: "Only a verified fire alert can be resolved" });
    }

    alert.status = "resolved";
    alert.resolvedAt = new Date();
    await alert.save();

    const populatedAlert = await Alert.findById(alert._id).populate("reading").populate("notifiedStation");

    const io = req.app.get("io");
    io.emit("alert:resolved", populatedAlert);

    res.json({ success: true, alert: populatedAlert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to resolve alert" });
  }
});

module.exports = router;
