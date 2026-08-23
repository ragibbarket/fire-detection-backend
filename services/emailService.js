const nodemailer = require("nodemailer");
const crypto = require("crypto");

const transporter = nodemailer.createTransport({
  service: "gmail", // swap for SendGrid/Mailgun in production if needed
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // use a Gmail App Password, not the real password
  },
});

// Verify the Gmail credentials work as soon as the server starts, instead
// of only finding out when the first fire alert tries (and silently fails)
// to send. Look for this log line right after `npm run dev` starts.
transporter.verify((err) => {
  if (err) {
    console.error(
      "[email] Gmail connection FAILED - verification emails will not send. " +
      "Check EMAIL_USER/EMAIL_PASS in .env (EMAIL_PASS must be a 16-char Gmail App Password, not your normal password):",
      err.message
    );
  } else {
    console.log("[email] Gmail connection OK - ready to send verification emails");
  }
});

function generateVerificationToken() {
  return crypto.randomBytes(20).toString("hex");
}

/**
 * Emails all registered verifiers a link that opens the app/web to review
 * the alert. Whoever clicks first and confirms marks the alert verified.
 */
async function sendVerificationEmails(alert, reading, verifiers) {
  const verifyUrl = `${process.env.APP_VERIFY_URL}/${alert._id}?token=${alert.verificationToken}`;

  const html = `
    <h2>Possible fire detected</h2>
    <p>Device: ${reading.deviceId}</p>
    <p>Temperature: ${reading.temperature}C | Smoke: ${reading.smokeValue} | ML confidence: ${(alert.mlConfidence * 100).toFixed(1)}%</p>
    <p>Please open the link below to review the sensor data and confirm whether this is a real fire.</p>
    <p><a href="${verifyUrl}">Review and verify this alert</a></p>
    <p>This link expires in 15 minutes.</p>
  `;

  const sendPromises = verifiers.map((v) =>
    transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: v.email,
      subject: "Fire alert - verification needed",
      html,
    })
  );

  await Promise.all(sendPromises);
}

module.exports = { generateVerificationToken, sendVerificationEmails };
