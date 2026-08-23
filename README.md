# Fire Detection Backend (MVP)

Node.js + Express + MongoDB backend for the IoT fire detection system.
Handles sensor ingestion, false-alarm filtering via an external ML service,
real-time dashboard updates (Socket.io), and one-click WhatsApp alerts (wa.me link, sent manually from the frontend).

## WhatsApp notification (no API/account needed)

No Twilio, no Meta Cloud API, no token or business account. The backend
builds a **`wa.me` click-to-chat link** with the alert details pre-filled
(device, readings, ML confidence, Google Maps location). `POST
/api/fire-stations/:id/notify` returns `{ waLink, message }` - the frontend
opens `waLink` in a new tab, which launches WhatsApp (web or app) with the
message ready to go, and a human taps send.

This means:
- Nothing to configure in `.env` for WhatsApp
- Works with any phone number, no sandbox/join step, no token expiry
- The actual "send" action is manual (by design, per current project plan) -
  the alert is marked `notified` as soon as the link is generated

## Deploying for free (Render + MongoDB Atlas)

1. Push this folder to its own GitHub repo.
2. Create a free MongoDB Atlas M0 cluster, allow network access from
   `0.0.0.0/0`, and copy the connection string into `MONGO_URI`.
3. On [render.com](https://render.com), New + → Web Service → connect the
   repo. Build command: `npm install`. Start command: `node server.js`.
   Instance type: Free.
4. Add all `.env` variables under the service's "Environment" tab
   (`ML_API_URL` can be filled in after the ML service is deployed - see
   `ml-service/README.md`).
5. Render gives you an HTTPS URL like `https://fire-backend-xxxx.onrender.com`.
   Update the ESP32 sketch's `SERVER_BASE_URL` to this (HTTPS, not the old
   local IP), and the dashboard's `VITE_API_URL` too.

**Free tier caveat:** the service sleeps after 15 minutes of no traffic
and takes 30-60s to wake on the next request. If the ESP32 posts every
30s, that traffic alone keeps it awake during active testing - just expect
a slow first response after any idle gap (e.g. first thing on defense day).

## Setup

```bash
npm install
cp .env.example .env   # fill in your MongoDB URI, email credentials, ML API URL
npm run dev             # nodemon, auto-restart on changes
```

**Check the terminal right after `npm run dev` starts** - you should see
`[email] Gmail connection OK - ready to send verification emails`. If you
see a FAILED message instead, `EMAIL_USER`/`EMAIL_PASS` in `.env` are wrong
(most likely `EMAIL_PASS` is not a 16-character Gmail App Password).

**No fire alert emails will send until at least one verifier is
registered.** Add one with:
```bash
curl -X POST http://localhost:5000/api/verifiers -H "Content-Type: application/json" -d "{\"name\": \"Your Name\", \"email\": \"you@gmail.com\"}"
```
Repeat for all 3 verifiers. Check who's registered with `GET /api/verifiers`.
If a fire alert fires with zero verifiers registered, the terminal logs a
warning and no email is sent (the alert still shows up on the dashboard and
can be verified there instead).

**Fire station "Notify" list will be empty until you register at least one
station too:**
```bash
curl -X POST http://localhost:5000/api/fire-stations -H "Content-Type: application/json" -d "{\"name\": \"Mohammadpur Fire Station\", \"address\": \"Mohammadpur, Dhaka\", \"latitude\": 23.7615, \"longitude\": 90.3535, \"whatsappNumber\": \"+8801XXXXXXXXX\"}"
```
Repeat for each station you want available. Check with `GET /api/fire-stations`.

## Architecture

```
ESP32 (sensors) --> POST /api/sensor-data --> MongoDB (Reading)
                                            --> if suspicious: call ML service
                                            --> ML says fire: Alert (pending_verification)
                                                --> email 3 verifiers with a review link
                                            --> ML says false alarm: Alert (false_alarm), no email

Verifier clicks email link --> GET /api/verify/:alertId?token=..  (loads alert for review)
                             --> POST /api/verify/:alertId        (confirmed | false_alarm)
                                 --> confirmed: Alert.status = verified_fire

App shows nearby fire stations --> GET /api/fire-stations?lat=..&lng=..
User taps a station            --> POST /api/fire-stations/:id/notify
                                    --> a wa.me link with a Google Maps location, opened by the frontend
                                    --> Alert.status = notified
```

Only a `verified_fire` alert can be sent to a fire station - `POST /api/fire-stations/:id/notify`
rejects alerts that haven't been human-verified yet.

## API Endpoints

### `POST /api/sensor-data`
ESP32 posts a new reading here. **Every reading is now scored by the ML
service** (not just ones crossing the threshold), so the dashboard can show
a live, continuously-updating fire-likelihood confidence. An `Alert` record
is only created when the reading crosses the basic threshold (to keep alert
history meaningful) or when the ML service predicts `fire`.

Request body:
```json
{
  "deviceId": "esp32-01",
  "flameDetected": true,
  "smokeValue": 520,
  "temperature": 48.5,
  "humidity": 40
}
```

Response:
```json
{ "reading": { ... }, "alert": { ... } }
```
`alert` is `null` if the reading did not cross the suspicion threshold.

### `GET /api/sensor-data/latest?limit=50`
Latest readings for dashboard charts/history.

### `POST /api/sensor-data/:readingId/label`
Body: `{ label: "fire" | "false_alarm" }`. Sets ground truth directly on any
reading, independent of ML prediction or whether an Alert exists - use
this for small-scale physical tests (e.g. a lighter held to the flame
sensor) where flame is genuinely detected but smoke/temperature stay too
low to cross the basic suspicion threshold, so no Alert would otherwise
ever get created for it. Feeds into `GET /api/alerts/training-data`
alongside verified alerts.

### `GET /api/alerts`
All alerts, most recent first, with the related reading populated.

### `POST /api/alerts/:id/dashboard-verify`
Body: `{ decision: "confirmed" | "false_alarm", verifierEmail }`. Web-dashboard
equivalent of the email-link verify flow - no token needed, but still
requires picking which registered verifier is confirming, so there's an
accountable human decision before a fire station is notified. Rejects
alerts not currently in `pending_verification`.

### `GET /api/alerts/status?deviceId=esp32-01`
Returns `{ status, mlPrediction, buzzerShouldSound }` for the given device.
`buzzerShouldSound` is `true` as soon as the **latest reading's ML
prediction is "fire"** - no human verification needed for this (human
verification is still required before a fire station gets WhatsApp'd, see
below). It goes back to `false` automatically once a later normal reading
comes in, or if a human marks the alert `false_alarm` or resolves it.
Polled by the ESP32 every few seconds to drive its continuous alarm.

### `POST /api/alerts/:id/resolve`
Manual override - only works on `verified_fire` or `notified` alerts.
Silences the buzzer (via the `/status` endpoint) once a human has actually
dealt with the situation. If the next reading is still fire-like, a new
alert is created and the buzzer naturally turns back on.

### `GET /api/alerts/training-data`
Returns every reading with a human-set ground-truth `humanLabel`
(`{ flameDetected, smokeValue, temperature, humidity, label }`), sourced
from BOTH alert verification (dashboard/email) AND direct manual labeling
(`POST /api/sensor-data/:readingId/label`) - not the model's own
unverified predictions. Used by the ML service's automatic retraining
scheduler (see `ml-service/README.md`).

### `GET /api/verifiers`
Lists registered verifiers (name, email) for the dashboard's "verifying as" picker.

### `GET /api/verify/:alertId?token=...`
Called when a verifier opens the email link. Returns the alert + reading so
the app/web can render the review screen. Fails if the token is wrong,
expired, or the alert was already reviewed.

### `POST /api/verify/:alertId`
Body: `{ token, decision: "confirmed" | "false_alarm", verifierEmail }`.
Records which of the 3 verifiers responded and moves the alert to
`verified_fire` or `false_alarm`.

### `GET /api/fire-stations?lat=..&lng=..`
Returns the fire station directory, sorted nearest-first if coordinates are given.

### `POST /api/fire-stations`
Body: `{ name, address, latitude, longitude, whatsappNumber }`. Registers a
fire station without touching MongoDB directly.

### `POST /api/fire-stations/:id/notify`
Body: `{ alertId }`. Builds a `wa.me` link with the alert message pre-filled
(no external API call). Response: `{ success, waLink, message, alert }`.
The frontend should open `waLink` in a new tab so a human can review and
send it. Marks the alert `notified`. Only works on alerts already in
`verified_fire` status.

## ML service contract

This backend expects a separate Python microservice (Flask/FastAPI) at
`ML_API_URL` with:

### `POST /predict`
Body: `{ flameDetected, smokeValue, temperature, humidity }`
Response: `{ "prediction": "fire" | "false_alarm", "confidence": 0.83, "reasoning": "..." }`

If the ML service is down or not built yet, `services/mlService.js`
automatically falls back to a simple threshold rule, so the rest of the
pipeline (backend, dashboard, WhatsApp) can be developed and demoed
independently of the ML part.

## Socket.io events (for the React dashboard)

- `sensor:reading` - emitted on every new sensor reading
- `alert:new` - emitted when a suspicious reading is classified (fire or false alarm)
- `alert:notified` - emitted after the WhatsApp message is successfully sent

## Testing without hardware (demo simulator)

Before the ESP32 is purchased/flashed, run the included simulator to post
realistic readings every 30 seconds - same payload shape the real device
will use, so nothing else in the pipeline needs to change later:

```bash
npm run simulate
```

It cycles through normal readings (~77%), false-alarm-like spikes (~15%,
smoke/heat but no flame), and fire-like readings (~8%, flame + high smoke +
high temp) so you can see the ML filtering, email verification, dashboard,
and WhatsApp notify steps all working end-to-end. Tune the mix or interval
via the `SIMULATOR_*` variables in `.env`. When the real ESP32 is ready,
just stop this script - the device posts to the same endpoint directly.

## Next steps

- Build the ML microservice and point `ML_API_URL` to it
- Build the React dashboard consuming these REST + Socket.io endpoints
- Flash the ESP32 to POST readings to `/api/sensor-data`
