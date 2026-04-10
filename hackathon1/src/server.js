const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { WebSocketServer } = require("ws");
const analyzeRoutes = require("./routes/analyze");
const { secureHeaders, apiRateLimit, processAndPurge, csrfProtection } = require("./securityMiddleware");
const { analyzeSignal } = require("./onionEngine");

const app = express();
const server = http.createServer(app);

const port = Number(process.env.PORT || 8080);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://127.0.0.1:5500,http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use(secureHeaders());
app.use(cors({
  origin: function allowOrigin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use(apiRateLimit());
app.use(processAndPurge());
app.use(csrfProtection({
  cookieName: process.env.CSRF_COOKIE_NAME,
  headerName: process.env.CSRF_HEADER_NAME,
}));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "digiguard-onion-engine" });
});

app.use("/api", analyzeRoutes);

const frontendPath = path.join(__dirname, "..", "..", "frontend");
app.use(express.static(frontendPath));
app.get("/", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: "Internal error", message: err.message });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "welcome", message: "DigiGuard live channel connected" }));

  socket.on("message", async (message) => {
    try {
      const payload = JSON.parse(message.toString("utf-8"));
      const result = await analyzeSignal(payload);

      socket.send(JSON.stringify({
        type: "risk-update",
        payload: result,
      }));
    } catch (_err) {
      socket.send(JSON.stringify({
        type: "error",
        message: "Invalid telemetry payload",
      }));
    }
  });
});

server.listen(port, () => {
  // Intentionally log only service-level info and no user telemetry.
  console.log(`DigiGuard backend listening on http://localhost:${port}`);
});
