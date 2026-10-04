const admin = require('firebase-admin')

// Don't crash the whole server if Firebase isn't configured yet - FCM push
// is an addition alongside the existing email notifications, not a
// replacement, so the app should still work (minus push) without it.
let initialized = false

if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    })
    initialized = true
    console.log('[fcm] Firebase Admin initialized - push notifications enabled')
  } catch (err) {
    console.error('[fcm] Failed to initialize Firebase Admin:', err.message)
  }
} else {
  console.warn(
    '[fcm] FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY not set - ' +
      'push notifications disabled, email notifications still work normally.',
  )
}

module.exports = { admin, isFirebaseEnabled: () => initialized }
