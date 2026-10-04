const express = require('express')
const router = express.Router()
const Reading = require('../models/Reading')
const Alert = require('../models/Alert')
const DeviceMembership = require('../models/DeviceMembership')
const { predictFire } = require('../services/mlService')
const {
  generateVerificationToken,
  sendVerificationEmails,
} = require('../services/emailService')
const { requireAuth } = require('../middleware/auth')
const { sendFirePushNotifications } = require('../services/pushService')

// POST /api/sensor-data - ESP32 posts a new reading here
router.post('/', async (req, res) => {
  try {
    const {
      deviceId,
      flameDetected,
      smokeValue,
      temperature,
      humidity,
      latitude,
      longitude,
    } = req.body

    if (smokeValue === undefined || temperature === undefined) {
      return res
        .status(400)
        .json({ error: 'smokeValue and temperature are required' })
    }

    // ML runs on EVERY reading now (not just suspicious ones), so the
    // dashboard can show a live, continuously-updating fire-likelihood
    // confidence rather than only surfacing a number when an alert fires.
    const readingInput = {
      flameDetected: Boolean(flameDetected),
      smokeValue,
      temperature,
      humidity,
    }
    const { prediction, confidence, reasoning } =
      await predictFire(readingInput)

    const reading = await Reading.create({
      deviceId,
      ...readingInput,
      latitude,
      longitude,
      mlPrediction: prediction,
      mlConfidence: confidence,
      mlReasoning: reasoning,
    })

    // broadcast the reading (with live ML confidence) to the dashboard
    const io = req.app.get('io')
    io.emit('sensor:reading', reading)

    // basic threshold, used only to decide whether this reading is worth
    // logging as an alert at all (keeps the alert history from being
    // flooded with every normal reading's "false_alarm" classification)
    const smokeThreshold = Number(process.env.SMOKE_THRESHOLD || 400)
    const tempThreshold = Number(process.env.TEMP_THRESHOLD || 45)
    const looksSuspicious =
      reading.flameDetected ||
      reading.smokeValue > smokeThreshold ||
      reading.temperature > tempThreshold

    if (prediction !== 'fire') {
      if (looksSuspicious) {
        // elevated reading, but ML says it's a false alarm - log it with
        // the reasoning so it's visible in the alert history
        const alert = await Alert.create({
          reading: reading._id,
          status: 'false_alarm',
          mlPrediction: prediction,
          mlConfidence: confidence,
          mlReasoning: reasoning,
        })
        io.emit('alert:new', alert)
        return res.status(201).json({ reading, alert })
      }
      // normal, unremarkable reading - no alert record needed
      return res.status(201).json({ reading, alert: null })
    }

    // ML thinks it's a real fire -> don't auto-notify, ask a human to verify first
    const alert = await Alert.create({
      reading: reading._id,
      status: 'pending_verification',
      mlPrediction: prediction,
      mlConfidence: confidence,
      mlReasoning: reasoning,
      verificationToken: generateVerificationToken(),
      verificationExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min
    })

    const memberships = await DeviceMembership.find({
      device: deviceId,
      status: 'active',
    }).populate('user', 'name email fcmTokens')
    const recipients = memberships.map((m) => ({
      name: m.user.name,
      email: m.user.email,
    }))

    if (recipients.length === 0) {
      console.warn(
        `[email] No active users registered for device "${deviceId}" - no emails sent for alert ${alert._id}. ` +
          `Register an owner with POST /api/auth/register-owner first.`,
      )
    } else {
      try {
        await sendVerificationEmails(alert, reading, recipients)
        console.log(
          `[email] Verification emails sent to ${recipients.map((r) => r.email).join(', ')}`,
        )
      } catch (emailErr) {
        // don't let an email failure break the alert/reading response -
        // the alert still exists and can be verified from the dashboard
        console.error(
          '[email] Failed to send verification emails:',
          emailErr.message,
        )
      }
    }

    // FCM push - alongside email, not instead of it. Same failure
    // isolation: a push error shouldn't break the alert/reading response.
    try {
      const pushResult = await sendFirePushNotifications(
        alert,
        reading,
        memberships,
      )
      if (pushResult) {
        console.log(
          `[fcm] Push sent: ${pushResult.sent} delivered, ${pushResult.failed} failed`,
        )
      }
    } catch (pushErr) {
      console.error('[fcm] Failed to send push notifications:', pushErr.message)
    }

    io.emit('alert:new', alert)
    return res.status(201).json({ reading, alert })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to process sensor reading' })
  }
})

// GET /api/sensor-data/latest?limit=50 - for dashboard history/chart
router.get('/latest', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const readings = await Reading.find().sort({ createdAt: -1 }).limit(limit)
  res.json(readings)
})

// POST /api/sensor-data/:readingId/label
// Body: { label: "fire" | "false_alarm" }
//
// Lets a human directly set the GROUND TRUTH for any reading, regardless
// of what the ML predicted and regardless of whether an Alert was ever
// created for it. This exists specifically for small-scale physical
// tests (e.g. holding a lighter to the flame sensor) where flame is
// genuinely detected but smoke/temperature stay too low to cross the
// basic suspicion threshold - such a reading would otherwise never
// become an Alert, so there'd be no way to teach the model "this WAS a
// real fire" from it. This is the primary source (along with verified
// alerts) that GET /api/alerts/training-data exports for retraining.
router.post('/:readingId/label', requireAuth, async (req, res) => {
  try {
    const { label } = req.body
    if (!['fire', 'false_alarm'].includes(label)) {
      return res
        .status(400)
        .json({ error: "label must be 'fire' or 'false_alarm'" })
    }

    const reading = await Reading.findById(req.params.readingId)
    if (!reading) return res.status(404).json({ error: 'Reading not found' })

    reading.humanLabel = label
    reading.humanLabeledAt = new Date()
    await reading.save()

    res.json({ success: true, reading })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to label reading' })
  }
})

module.exports = router
