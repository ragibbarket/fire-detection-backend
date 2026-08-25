const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "7d";

if (!JWT_SECRET) {
  console.error("[auth] JWT_SECRET is not set in .env - authentication will fail. Set a long random string.");
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken };
