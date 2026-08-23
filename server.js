require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./config/db");

const sensorRoutes = require("./routes/sensorRoutes");
const alertRoutes = require("./routes/alertRoutes");
const verifyRoutes = require("./routes/verifyRoutes");
const fireStationRoutes = require("./routes/fireStationRoutes");
const verifierRoutes = require("./routes/verifierRoutes");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.set("io", io); // so routes can emit events without importing io directly

app.use(cors());
app.use(express.json());

app.use("/api/sensor-data", sensorRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/verify", verifyRoutes);
app.use("/api/fire-stations", fireStationRoutes);
app.use("/api/verifiers", verifierRoutes);

app.get("/", (req, res) => {
  res.json({ status: "Fire detection backend is running" });
});

io.on("connection", (socket) => {
  console.log("Dashboard connected:", socket.id);
  socket.on("disconnect", () => console.log("Dashboard disconnected:", socket.id));
});

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
