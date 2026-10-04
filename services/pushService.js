const { admin, isFirebaseEnabled } = require('../config/firebase')
const User = require('../models/User')

/**
 * Sends an FCM push notification to every active device user's registered
 * phone(s), right alongside the existing email notification for the same
 * fire alert. Silently does nothing if Firebase isn't configured (push is
 * additive, not a replacement for email) or if nobody has a token yet.
 */
async function sendFirePushNotifications(alert, reading, memberships) {
  if (!isFirebaseEnabled()) return

  const tokens = memberships
    .flatMap((m) => m.user.fcmTokens || [])
    .filter(Boolean)
  if (tokens.length === 0) return

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: 'Fire alert!',
      body: `Possible fire detected on ${reading.deviceId} - please verify`,
    },
    data: {
      alertId: String(alert._id),
      deviceId: String(reading.deviceId),
    },
  })

  // clean up tokens for uninstalled apps / logged-out devices so future
  // sends don't keep retrying them
  const invalidTokens = []
  response.responses.forEach((r, i) => {
    if (
      !r.success &&
      r.error?.code === 'messaging/registration-token-not-registered'
    ) {
      invalidTokens.push(tokens[i])
    }
  })
  if (invalidTokens.length > 0) {
    await User.updateMany({}, { $pull: { fcmTokens: { $in: invalidTokens } } })
  }

  return { sent: response.successCount, failed: response.failureCount }
}

module.exports = { sendFirePushNotifications }
