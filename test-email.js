/**
 * test-email.js
 * ---------------------------------------------------------------
 * Standalone script to test whether EMAIL_USER/EMAIL_PASS in .env
 * can actually send a Gmail email - completely separate from the
 * rest of the app, so any error is easy to spot.
 *
 * Usage:
 *   node test-email.js your.test.address@gmail.com
 */

require("dotenv").config();
const nodemailer = require("nodemailer");

const to = process.argv[2];
if (!to) {
  console.error("Usage: node test-email.js <recipient-email>");
  process.exit(1);
}

console.log("Using EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS length:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : "MISSING");
console.log("(A correct Gmail App Password is exactly 16 characters, no spaces)\n");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.sendMail(
  {
    from: process.env.EMAIL_FROM,
    to,
    subject: "Fire detection - test email",
    html: "<p>If you got this, Gmail sending works.</p>",
  },
  (err, info) => {
    if (err) {
      console.error("\nFAILED to send email:");
      console.error(err);
      process.exit(1);
    } else {
      console.log("\nSUCCESS - email sent:", info.response);
    }
  }
);
