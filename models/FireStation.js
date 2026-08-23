const mongoose = require("mongoose");

const fireStationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  whatsappNumber: { type: String, required: true }, // e.g. "+8801XXXXXXXXX" (Meta WhatsApp Cloud API format)
});

module.exports = mongoose.model("FireStation", fireStationSchema);
