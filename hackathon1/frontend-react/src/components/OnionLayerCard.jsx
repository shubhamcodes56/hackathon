import { motion } from "framer-motion";

const palette = {
  green: "#00c16a",
  yellow: "#ffbf2f",
  red: "#ff3b4e",
};

const layerList = [
  { key: "perimeter", label: "Layer 1 - Perimeter" },
  { key: "behavioralFilter", label: "Layer 2 - Behavioral Filter" },
  { key: "actionInterceptor", label: "Layer 3 - Action Interceptor" },
];

function riskColor(colorState) {
  return palette[colorState] || palette.green;
}

export default function OnionLayerCard({ result }) {
  const color = riskColor(result.colorState);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="onion-card"
      style={{ borderColor: color, boxShadow: `0 0 40px ${color}33` }}
    >
      <div className="onion-card-head">
        <h2>Onion Engine</h2>
        <span className="pill" style={{ background: color, color: "#0b0d10" }}>
          {result.risk.toUpperCase()} - {result.score}
        </span>
      </div>

      <div className="layer-stack">
        {layerList.map((layer, index) => {
          const layerScore = result.layers[layer.key].score;
          const depth = index + 1;

          return (
            <motion.div
              key={layer.key}
              className="layer-row"
              initial={{ x: -18, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.12 + index * 0.08, duration: 0.25 }}
            >
              <div className="layer-title">{layer.label}</div>
              <div className="layer-bar">
                <motion.div
                  className="layer-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(6, layerScore)}%` }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.08 }}
                  style={{ background: color, filter: `drop-shadow(0 0 ${8 + depth * 3}px ${color})` }}
                />
              </div>
              <div className="layer-score">{layerScore}</div>
            </motion.div>
          );
        })}
      </div>

      {result.layer4Triggered ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="final-warning"
        >
          FINAL WARNING ACTIVATED
        </motion.div>
      ) : null}

      <p className="advice">{result.advice}</p>
      <p className="latency">Latency: {result.latencyMs} ms</p>
    </motion.div>
  );
}
