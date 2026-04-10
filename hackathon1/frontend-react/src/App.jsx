import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import OnionLayerCard from "./components/OnionLayerCard";
import { analyzeTelemetry, bootstrapCsrf, openLiveSocket } from "./api";

const initialResult = {
  risk: "low",
  score: 0,
  colorState: "green",
  layer4Triggered: false,
  latencyMs: 0,
  advice: "Run an Onion scan to start real-time protection analysis.",
  layers: {
    perimeter: { score: 0 },
    behavioralFilter: { score: 0 },
    actionInterceptor: { score: 0 },
  },
};

const payloadModes = {
  safe: {
    senderId: "MYBANK",
    message: "Your monthly statement is available in the official app.",
    url: "https://example.com/security",
    fileName: "statement.pdf",
    source: "app",
  },
  suspicious: {
    senderId: "A1",
    message: "URGENT: account blocked. Verify immediately to avoid penalty!!",
    url: "https://bit.ly/3x8k2v1",
    fileName: "security_update.apk",
    source: "browser",
  },
  extreme: {
    senderId: "id",
    message: "FINAL WARNING!!! Your account is blocked immediately or police action will be taken. Verify OTP now!!!",
    url: "http://198.51.100.42/login",
    fileName: "bank_patch.apk",
    source: "browser",
  },
};

export default function App() {
  const [result, setResult] = useState(initialResult);
  const [mode, setMode] = useState("suspicious");
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(true);

  const glow = useMemo(() => {
    if (result.colorState === "red") return "var(--risk-red)";
    if (result.colorState === "yellow") return "var(--risk-yellow)";
    return "var(--risk-green)";
  }, [result.colorState]);

  useEffect(() => {
    let socket;

    bootstrapCsrf()
      .then(() => {
        socket = openLiveSocket((update) => setResult(update));
        socket.addEventListener("open", () => setOnline(true));
        socket.addEventListener("close", () => setOnline(false));
      })
      .catch(() => {
        setOnline(false);
      });

    return () => {
      if (socket) socket.close();
    };
  }, []);

  async function runScan() {
    setLoading(true);
    try {
      const scan = await analyzeTelemetry(payloadModes[mode]);
      setResult(scan);
    } catch (_err) {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <motion.section
        className="hero"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <p className="chip">DIGIGUARD MOTION CONSOLE</p>
        <h1>Scam Journey Defense, Layer by Layer</h1>
        <p className="subtitle">
          Privacy-first telemetry scoring with a live Onion engine. Nothing is stored. Everything is assessed in-memory.
        </p>

        <div className="controls">
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="safe">Safe Message</option>
            <option value="suspicious">Suspicious Message</option>
            <option value="extreme">Extreme Attack Pattern</option>
          </select>
          <button onClick={runScan} disabled={loading}>
            {loading ? "Scanning..." : "Run Onion Scan"}
          </button>
        </div>

        <div className="status-row">
          <span className={`status-dot ${online ? "online" : "offline"}`} />
          <span>{online ? "Backend Live" : "Backend Offline"}</span>
        </div>
      </motion.section>

      <motion.section
        className="console"
        style={{ borderColor: glow }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.35 }}
      >
        <OnionLayerCard result={result} />
      </motion.section>
    </main>
  );
}
