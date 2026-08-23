const axios = require("axios");

/**
 * Sends sensor features to the ML microservice (Flask/FastAPI)
 * and returns a fire / false_alarm prediction.
 *
 * Expected ML service contract:
 *   POST { flameDetected, smokeValue, temperature, humidity }
 *   -> { prediction: "fire" | "false_alarm", confidence: 0.0-1.0, reasoning: string }
 *
 * If the ML service is unreachable (e.g. not deployed yet during early
 * development), falls back to a simple rule-based check so the pipeline
 * keeps working end-to-end.
 */
async function predictFire(reading) {
  try {
    const response = await axios.post(
      process.env.ML_API_URL,
      {
        flameDetected: reading.flameDetected,
        smokeValue: reading.smokeValue,
        temperature: reading.temperature,
        humidity: reading.humidity,
      },
      { timeout: 5000 }
    );
    return response.data; // { prediction, confidence }
  } catch (err) {
    console.warn("ML service unavailable, falling back to rule-based check:", err.message);
    return ruleBasedFallback(reading);
  }
}

function ruleBasedFallback(reading) {
  const smokeThreshold = Number(process.env.SMOKE_THRESHOLD || 400);
  const tempThreshold = Number(process.env.TEMP_THRESHOLD || 45);

  const isLikelyFire =
    reading.flameDetected &&
    (reading.smokeValue > smokeThreshold || reading.temperature > tempThreshold);

  return {
    prediction: isLikelyFire ? "fire" : "false_alarm",
    confidence: isLikelyFire ? 0.6 : 0.4, // low confidence, since this is a fallback
    reasoning: `ML service was unreachable, so this used a simple threshold check instead: flame=${reading.flameDetected}, smoke=${reading.smokeValue}ppm (threshold ${smokeThreshold}), temperature=${reading.temperature}C (threshold ${tempThreshold}).`,
  };
}

module.exports = { predictFire };
