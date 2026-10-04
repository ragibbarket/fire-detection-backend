const mongoose = require('mongoose')

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    fcmTokens: [{ type: String }], // Firebase Cloud Messaging tokens, one per logged-in device
  },
  { timestamps: true },
)

module.exports = mongoose.model('User', userSchema)
