const express = require("express");
const router = express.Router();
const Verifier = require("../models/Verifier");

// GET /api/verifiers - for the dashboard's "verifying as" picker
router.get("/", async (req, res) => {
  const verifiers = await Verifier.find().select("name email");
  res.json(verifiers);
});

// POST /api/verifiers - body: { name, email, phone? }
// Quick way to register the 3 verifiers without touching MongoDB directly.
router.post("/", async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    if (!name || !email) return res.status(400).json({ error: "name and email are required" });

    const verifier = await Verifier.create({ name, email, phone });
    res.status(201).json(verifier);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create verifier" });
  }
});

module.exports = router;
