const express = require('express')
const router = express.Router()
const User = require('../models/User')
const { requireAuth } = require('../middleware/auth')

// POST /api/users/fcm-token - body: { token }
// Called by the Flutter app right after login (and whenever Firebase
// rotates the token) to register this device for push notifications.
// $addToSet avoids duplicate tokens if the app re-registers the same device.
router.post('/fcm-token', requireAuth, async (req, res) => {
  try {
    const { token } = req.body
    if (!token) return res.status(400).json({ error: 'token is required' })

    await User.findByIdAndUpdate(req.user.userId, {
      $addToSet: { fcmTokens: token },
    })
    res.status(200).json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save push token' })
  }
})

module.exports = router
