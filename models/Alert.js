const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    reading: { type: mongoose.Schema.Types.ObjectId, ref: "Reading", required: true },
    // status flow: pending -> pending_verification -> verified_fire / false_alarm -> notified
    // "resolved" is a manual override (Resolve button) that silences the
    // buzzer after a human has confirmed real fire and dealt with it
    status: {
      type: String,
      enum: ["pending", "pending_verification", "verified_fire", "false_alarm", "notified", "resolved"],
      default: "pending",
    },
    mlPrediction: { type: String, enum: ["fire", "false_alarm", null], default: null },
    mlConfidence: { type: Number, default: null }, // 0-1
    mlReasoning: { type: String, default: null }, // plain-language explanation from the ML service

    // human verification (email -> app link -> verify)
    verificationToken: { type: String, default: null },
    verificationExpiresAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Verifier", default: null },
    verifiedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },

    // which fire station was ultimately notified
    notifiedStation: { type: mongoose.Schema.Types.ObjectId, ref: "FireStation", default: null },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Alert", alertSchema);
