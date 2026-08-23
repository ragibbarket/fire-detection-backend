/**
 * No WhatsApp API/account is used here (no Twilio, no Meta Cloud API).
 * Instead, this builds a WhatsApp "click-to-chat" link (wa.me), which
 * needs no account, token, or approval - opening it in a browser/app
 * pre-fills a WhatsApp message that a human then reviews and taps send.
 *
 * This matches the current plan: the frontend (dashboard/app) opens the
 * link and the user sends the message themselves.
 */

function buildFireAlertMessage(alertInfo) {
  const { deviceId, temperature, smokeValue, confidence, createdAt, latitude, longitude } = alertInfo;

  const locationLine =
    latitude && longitude ? `Location: https://maps.google.com/?q=${latitude},${longitude}\n` : "";

  return (
    `FIRE ALERT - verified\n` +
    `Device: ${deviceId}\n` +
    `Temperature: ${temperature}C\n` +
    `Smoke level: ${smokeValue}\n` +
    `ML confidence: ${(confidence * 100).toFixed(1)}%\n` +
    locationLine +
    `Time: ${new Date(createdAt).toLocaleString()}\n` +
    `Please respond immediately.`
  );
}

/**
 * Builds a wa.me link that opens WhatsApp with the message pre-filled,
 * ready for a human to review and send.
 * @param {string} toNumber - phone number with country code, e.g. "+8801XXXXXXXXX" or "8801XXXXXXXXX"
 * @param {Object} alertInfo - reading + alert details to include in the message
 * @returns {{ message: string, waLink: string }}
 */
function buildFireAlertLink(toNumber, alertInfo) {
  const message = buildFireAlertMessage(alertInfo);
  const digitsOnly = toNumber.replace("whatsapp:", "").replace("+", "");
  const waLink = `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;
  return { message, waLink };
}

module.exports = { buildFireAlertLink };
