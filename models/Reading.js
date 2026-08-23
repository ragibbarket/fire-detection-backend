const mongoose = require("mongoose");

const readingSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, default: "esp32-01" },
    flameDetected: { type: Boolean, required: true }, // digital flame sensor output
    smokeValue: { type: Number, required: true }, // MQ-2 analog reading
    temperature: { type: Number, required: true }, // DHT11/22
    humidity: { type: Number, required: true },
    latitude: { type: Number }, // device install location, used for the fire station map
    longitude: { type: Number },

    // filled in on every reading (not just alerts) so the dashboard can show
    // a live fire-likelihood confidence, not just for triggered alerts
    mlPrediction: { type: String, enum: ["fire", "false_alarm", null], default: null },
    mlConfidence: { type: Number, default: null },
    mlReasoning: { type: String, default: null },

    // Ground truth, set by a human who actually knows what happened during
    // the test (e.g. "I held a lighter to the sensor - this IS fire" even
    // if smoke/temp were too low for the basic threshold to ever create an
    // Alert for it). Independent of mlPrediction and of whether an Alert
    // exists - this is the real training signal, not the model's own guess.
    humanLabel: { type: String, enum: ["fire", "false_alarm", null], default: null },
    humanLabeledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Reading", readingSchema);
