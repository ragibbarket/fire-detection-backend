/**
 * DEMO DATA SIMULATOR
 * ---------------------------------------------------------------
 * Mimics an ESP32 posting sensor readings to the backend, using the
 * EXACT SAME payload shape the real device will send to
 * POST /api/sensor-data. Use this to test the full pipeline (ML,
 * email verification, dashboard, WhatsApp) before hardware is ready.
 *
 * When the real ESP32 is flashed and posting directly to the backend,
 * simply stop running this script (npm run simulate) - no backend or
 * dashboard code needs to change, since both send the same JSON shape.
 *
 * Usage:
 *   node simulator/demoDataGenerator.js
 *   (or: npm run simulate)
 */

require("dotenv").config();
const axios = require("axios");

const API_URL = process.env.SIMULATOR_API_URL || "http://localhost:5000/api/sensor-data";
const DEVICE_ID = process.env.SIMULATOR_DEVICE_ID || "esp32-01";
const INTERVAL_MS = Number(process.env.SIMULATOR_INTERVAL_MS) || 30000; // 30s, matches ESP32 posting interval

// Fixed install location for the demo device (swap for your real device's coords)
const DEVICE_LAT = Number(process.env.SIMULATOR_LAT) || 23.7461; // Dhaka
const DEVICE_LNG = Number(process.env.SIMULATOR_LNG) || 90.3742;

/**
 * THIS is the function you will eventually delete/ignore once the real
 * ESP32 is sending data. Everything below it (the posting loop) stays
 * the same - it just forwards whatever payload it receives.
 *
 * Returns a payload in the exact shape the ESP32 sensor code should send.
 */
function generateReading() {
  const roll = Math.random();

  // ~8% chance: simulate a real fire scenario (flame + high smoke + high temp)
  if (roll < 0.08) {
    return {
      deviceId: DEVICE_ID,
      flameDetected: true,
      smokeValue: randomInRange(500, 750),
      temperature: randomFloat(50, 65),
      humidity: randomFloat(20, 35),
      latitude: DEVICE_LAT,
      longitude: DEVICE_LNG,
    };
  }

  // ~15% chance: simulate a false-alarm scenario (smoke/heat but no flame - e.g. cooking, steam)
  if (roll < 0.23) {
    return {
      deviceId: DEVICE_ID,
      flameDetected: false,
      smokeValue: randomInRange(300, 460),
      temperature: randomFloat(35, 44),
      humidity: randomFloat(40, 60),
      latitude: DEVICE_LAT,
      longitude: DEVICE_LNG,
    };
  }

  // otherwise: normal, safe readings
  return {
    deviceId: DEVICE_ID,
    flameDetected: false,
    smokeValue: randomInRange(80, 150),
    temperature: randomFloat(26, 30),
    humidity: randomFloat(55, 70),
    latitude: DEVICE_LAT,
    longitude: DEVICE_LNG,
  };
}

function randomInRange(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(1));
}

async function postReading() {
  const payload = generateReading();
  try {
    const res = await axios.post(API_URL, payload);
    const tag = payload.flameDetected ? "FIRE-LIKE" : payload.smokeValue > 300 ? "SUSPICIOUS" : "normal";
    console.log(
      `[${new Date().toLocaleTimeString()}] (${tag}) sent -> smoke=${payload.smokeValue} temp=${payload.temperature}C flame=${payload.flameDetected}`,
      "| alert:", res.data.alert ? res.data.alert.status : "none"
    );
  } catch (err) {
    console.error(`[${new Date().toLocaleTimeString()}] Failed to post reading:`, err.message);
  }
}

console.log(`Demo simulator started. Posting to ${API_URL} every ${INTERVAL_MS / 1000}s...`);
postReading(); // send one immediately, then every interval
setInterval(postReading, INTERVAL_MS);
