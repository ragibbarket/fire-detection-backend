const { verifyToken } = require("../services/authService");
const DeviceMembership = require("../models/DeviceMembership");

// Verifies the JWT in the Authorization header, attaches req.user = { userId, email }
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const token = header.slice(7);
  try {
    req.user = verifyToken(token); // { userId, email, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token, please log in again" });
  }
}

// Requires req.user to be an ACTIVE member (owner or regular member) of
// :deviceId in the URL params. Use after requireAuth.
async function requireDeviceMember(req, res, next) {
  const deviceId = req.params.deviceId;
  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

  const membership = await DeviceMembership.findOne({
    device: deviceId,
    user: req.user.userId,
    status: "active",
  });
  if (!membership) return res.status(403).json({ error: "You are not an active user of this device" });

  req.membership = membership;
  next();
}

// Requires req.user to be the ACTIVE OWNER of :deviceId. Use after requireAuth.
async function requireDeviceOwner(req, res, next) {
  const deviceId = req.params.deviceId;
  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });

  const membership = await DeviceMembership.findOne({
    device: deviceId,
    user: req.user.userId,
    status: "active",
    role: "owner",
  });
  if (!membership) return res.status(403).json({ error: "Only the device owner can do this" });

  req.membership = membership;
  next();
}

module.exports = { requireAuth, requireDeviceMember, requireDeviceOwner };
