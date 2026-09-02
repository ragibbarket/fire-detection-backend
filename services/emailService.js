// const nodemailer = require("nodemailer");
// const crypto = require("crypto");

// const transporter = nodemailer.createTransport({
//   service: "gmail", // swap for SendGrid/Mailgun in production if needed
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS, // use a Gmail App Password, not the real password
//   },
// });

// Verify the Gmail credentials work as soon as the server starts, instead
// of only finding out when the first fire alert tries (and silently fails)
// to send. Look for this log line right after `npm run dev` starts.
// transporter.verify((err) => {
//   if (err) {
//     console.error(
//       "[email] Gmail connection FAILED - verification emails will not send. " +
//       "Check EMAIL_USER/EMAIL_PASS in .env (EMAIL_PASS must be a 16-char Gmail App Password, not your normal password):",
//       err.message
//     );
//   } else {
//     console.log("[email] Gmail connection OK - ready to send verification emails");
//   }
// });

// function generateVerificationToken() {
//   return crypto.randomBytes(20).toString("hex");
// }

/**
 * Emails all registered verifiers a link that opens the app/web to review
 * the alert. Whoever clicks first and confirms marks the alert verified.
 */
// async function sendVerificationEmails(alert, reading, verifiers) {
//   const verifyUrl = `${process.env.APP_VERIFY_URL}/${alert._id}?token=${alert.verificationToken}`;

//   const html = `
//     <h2>Possible fire detected</h2>
//     <p>Device: ${reading.deviceId}</p>
//     <p>Temperature: ${reading.temperature}C | Smoke: ${reading.smokeValue} | ML confidence: ${(alert.mlConfidence * 100).toFixed(1)}%</p>
//     <p>Please open the link below to review the sensor data and confirm whether this is a real fire.</p>
//     <p><a href="${verifyUrl}">Review and verify this alert</a></p>
//     <p>This link expires in 15 minutes.</p>
//   `;

//   const sendPromises = verifiers.map((v) =>
//     transporter.sendMail({
//       from: process.env.EMAIL_FROM,
//       to: v.email,
//       subject: "Fire alert - verification needed",
//       html,
//     })
//   );

//   await Promise.all(sendPromises);
// }

/**
 * Emails an invited person a link to accept their device invitation
 * (set their name + password, then become an active member).
 */
// async function sendInviteEmail(invitation) {
//   const inviteUrl = `${process.env.APP_INVITE_URL}?token=${invitation.token}`;

//   const html = `
//     <h2>You've been invited to a Fire Detection device</h2>
//     <p>Device: ${invitation.device}</p>
//     <p>You'll be able to see live sensor data, verify fire alerts, and notify fire stations.</p>
//     <p><a href="${inviteUrl}">Accept invitation and set up your account</a></p>
//     <p>This link expires in 48 hours.</p>
//   `;

//   await transporter.sendMail({
//     from: process.env.EMAIL_FROM,
//     to: invitation.email,
//     subject: "You're invited to a Fire Detection device",
//     html,
//   });
// }

// module.exports = { generateVerificationToken, sendVerificationEmails, sendInviteEmail };

const axios = require('axios')
const crypto = require('crypto')

const MAILERSEND_API_URL = 'https://api.mailersend.com/v1/email'

if (!process.env.MAILERSEND_API_KEY) {
  console.error(
    '[email] MAILERSEND_API_KEY is not set in .env - emails will fail to send.',
  )
} else {
  console.log(
    '[email] MailerSend configured - ready to send verification/invite emails',
  )
}

async function sendEmail({ to, subject, html }) {
  await axios.post(
    MAILERSEND_API_URL,
    {
      from: {
        email: process.env.EMAIL_FROM,
        name: process.env.EMAIL_FROM_NAME || 'Fire Detection System',
      },
      to: [{ email: to }],
      subject,
      html,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.MAILERSEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
    },
  )
}

function generateVerificationToken() {
  return crypto.randomBytes(20).toString('hex')
}

/**
 * Emails all active device users a link that opens the app/web to review
 * the alert. Whoever clicks first and confirms marks the alert verified.
 */
async function sendVerificationEmails(alert, reading, recipients) {
  const verifyUrl = `${process.env.APP_VERIFY_URL}/${alert._id}?token=${alert.verificationToken}`

  const html = `
    <h2>Possible fire detected</h2>
    <p>Device: ${reading.deviceId}</p>
    <p>Temperature: ${reading.temperature}C | Smoke: ${reading.smokeValue} | ML confidence: ${(alert.mlConfidence * 100).toFixed(1)}%</p>
    <p>Please open the link below to review the sensor data and confirm whether this is a real fire.</p>
    <p><a href="${verifyUrl}">Review and verify this alert</a></p>
    <p>This link expires in 15 minutes.</p>
  `

  const sendPromises = recipients.map((r) =>
    sendEmail({
      to: r.email,
      subject: 'Fire alert - verification needed',
      html,
    }),
  )

  await Promise.all(sendPromises)
}

/**
 * Emails an invited person a link to accept their device invitation
 * (set their name + password, then become an active member).
 */
async function sendInviteEmail(invitation) {
  const inviteUrl = `${process.env.APP_INVITE_URL}?token=${invitation.token}`

  const html = `
    <h2>You've been invited to a Fire Detection device</h2>
    <p>Device: ${invitation.device}</p>
    <p>You'll be able to see live sensor data, verify fire alerts, and notify fire stations.</p>
    <p><a href="${inviteUrl}">Accept invitation and set up your account</a></p>
    <p>This link expires in 48 hours.</p>
  `

  await sendEmail({
    to: invitation.email,
    subject: "You're invited to a Fire Detection device",
    html,
  })
}

module.exports = {
  generateVerificationToken,
  sendVerificationEmails,
  sendInviteEmail,
}
