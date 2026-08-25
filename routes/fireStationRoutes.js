const express = require("express");
const router = express.Router();
const FireStation = require("../models/FireStation");
const Alert = require("../models/Alert");
const DeviceMembership = require("../models/DeviceMembership");
const { buildFireAlertLink } = require("../services/whatsappService");
const { requireAuth } = require("../middleware/auth");

// haversine distance in km, used to sort stations by proximity to the device
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/fire-stations?lat=..&lng=.. - list, nearest first if coords given
router.get("/", async (req, res) => {
  const stations = await FireStation.find();
  const { lat, lng } = req.query;

  if (lat && lng) {
    stations.sort(
      (a, b) =>
        distanceKm(Number(lat), Number(lng), a.latitude, a.longitude) -
        distanceKm(Number(lat), Number(lng), b.latitude, b.longitude)
    );
  }

  res.json(stations);
});

// POST /api/fire-stations - body: { name, address, latitude, longitude, whatsappNumber }
// Quick way to register stations without touching MongoDB directly.
router.post("/", async (req, res) => {
  try {
    const { name, address, latitude, longitude, whatsappNumber } = req.body;
    if (!name || latitude === undefined || longitude === undefined || !whatsappNumber) {
      return res.status(400).json({ error: "name, latitude, longitude, and whatsappNumber are required" });
    }

    const station = await FireStation.create({ name, address, latitude, longitude, whatsappNumber });
    res.status(201).json(station);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create fire station" });
  }
});

// POST /api/fire-stations/:id/notify - body: { alertId }
// No WhatsApp API is called here. This builds a wa.me link with the alert
// details pre-filled; the frontend opens it and a human taps send.
router.post("/:id/notify", requireAuth, async (req, res) => {
  try {
    const { alertId } = req.body;
    const station = await FireStation.findById(req.params.id);
    const alert = await Alert.findById(alertId).populate("reading");

    if (!station) return res.status(404).json({ error: "Fire station not found" });
    if (!alert) return res.status(404).json({ error: "Alert not found" });
    if (alert.status !== "verified_fire") {
      return res.status(409).json({ error: "This alert has not been verified as a real fire yet" });
    }

    const membership = await DeviceMembership.findOne({
      device: alert.reading.deviceId,
      user: req.user.userId,
      status: "active",
    });
    if (!membership) return res.status(403).json({ error: "You are not an active user of this device" });

    const { message, waLink } = buildFireAlertLink(station.whatsappNumber, {
      deviceId: alert.reading.deviceId,
      temperature: alert.reading.temperature,
      smokeValue: alert.reading.smokeValue,
      confidence: alert.mlConfidence,
      createdAt: alert.createdAt,
      latitude: alert.reading.latitude,
      longitude: alert.reading.longitude,
    });

    alert.status = "notified";
    alert.notifiedStation = station._id;
    alert.notifiedAt = new Date();
    await alert.save();

    const io = req.app.get("io");
    io.emit("alert:notified", alert);

    // frontend should open `waLink` in a new tab so the user can review + send
    res.json({ success: true, waLink, message, alert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to build WhatsApp notification link" });
  }
});

module.exports = router;
