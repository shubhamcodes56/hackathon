const crypto = require("crypto");
const { URL } = require("url");
const { performance } = require("perf_hooks");
const { analyzeUrgencyAndFear } = require("./nlp_utils");

const CYRILLIC_LOOKALIKES = /[\u0400-\u04FF]/;
const SUSPICIOUS_EXTENSIONS = new Set(["apk", "exe", "bat", "cmd", "msi", "scr", "js"]);

function normalizeDomain(input = "") {
  try {
    const parsed = new URL(input);
    return parsed.hostname.toLowerCase();
  } catch (_err) {
    return "";
  }
}

function hashInMemory(value = "") {
  const digest = crypto.createHash("sha256").update(value).digest("hex");
  return digest;
}

function scorePerimeter({ senderId = "", message = "", url = "" }) {
  const domain = normalizeDomain(url);
  const hiddenSender = /^([A-Za-z0-9]{1,4}|unknown|hidden)$/i.test(senderId);
  const homoglyph = CYRILLIC_LOOKALIKES.test(message);
  const shortener = /(bit\.ly|tinyurl\.com|t\.co|rb\.gy)/i.test(domain);

  let score = 0;
  if (hiddenSender) score += 24;
  if (homoglyph) score += 36;
  if (shortener) score += 18;

  return {
    score: Math.min(score, 100),
    hiddenSender,
    homoglyph,
    shortener,
  };
}

function scoreActionInterceptor({ url = "", fileName = "", source = "unknown" }) {
  const domain = normalizeDomain(url);
  const extension = (fileName.split(".").pop() || "").toLowerCase();
  const riskyExtension = SUSPICIOUS_EXTENSIONS.has(extension);
  const apkFromBrowser = extension === "apk" && source === "browser";
  const ipLiteralDomain = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);

  let score = 0;
  if (riskyExtension) score += 35;
  if (apkFromBrowser) score += 35;
  if (ipLiteralDomain) score += 20;

  return {
    score: Math.min(score, 100),
    domain,
    extension,
    riskyExtension,
    apkFromBrowser,
    ipLiteralDomain,
  };
}

function weightedScore({ linkRisk, urgencyRisk, behaviorRisk }) {
  const w1 = 0.45;
  const w2 = 0.30;
  const w3 = 0.25;

  return Math.round((w1 * linkRisk) + (w2 * urgencyRisk) + (w3 * behaviorRisk));
}

async function analyzeOnion(payload) {
  const start = performance.now();

  const senderId = payload.senderId || "";
  const message = payload.message || "";
  const url = payload.url || "";
  const fileName = payload.fileName || "";
  const source = payload.source || "unknown";

  const digest = hashInMemory(`${senderId}|${message}|${url}|${fileName}|${source}`);

  const [layer1, layer2, layer3] = await Promise.all([
    Promise.resolve(scorePerimeter({ senderId, message, url })),
    Promise.resolve(analyzeUrgencyAndFear(message)),
    Promise.resolve(scoreActionInterceptor({ url, fileName, source })),
  ]);

  const linkRisk = Math.min(100, layer1.score + (layer3.ipLiteralDomain ? 15 : 0));
  const behaviorRisk = Math.min(100, (layer3.apkFromBrowser ? 60 : 0) + (layer3.riskyExtension ? 40 : 0));

  const score = weightedScore({
    linkRisk,
    urgencyRisk: layer2.score,
    behaviorRisk,
  });

  const layer4Triggered = layer2.level === "high" && layer3.score >= 65;

  const risk = score >= 70 || layer4Triggered ? "high" : score >= 40 ? "medium" : "low";
  const colorState = risk === "high" ? "red" : risk === "medium" ? "yellow" : "green";

  const response = {
    traceId: digest.slice(0, 12),
    risk,
    score,
    colorState,
    layer4Triggered,
    layers: {
      perimeter: layer1,
      behavioralFilter: layer2,
      actionInterceptor: layer3,
    },
    advice: layer4Triggered
      ? "FINAL WARNING: This action matches active scam behavior. Stop and verify through an official channel."
      : risk === "high"
        ? "High risk detected. Avoid opening this link/file and verify independently."
        : risk === "medium"
          ? "Potential scam signals found. Proceed only after manual verification."
          : "No major scam markers detected in current telemetry.",
  };

  const end = performance.now();

  response.latencyMs = Number((end - start).toFixed(2));

  return response;
}

module.exports = {
  analyzeOnion,
};
