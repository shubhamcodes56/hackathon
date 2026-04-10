const crypto = require("crypto");
const { URL } = require("url");
const { performance } = require("perf_hooks");

const HIGH_RISK_FILE_TYPES = new Set(["apk", "exe", "dex", "bat", "cmd", "scr", "msi"]);
const BLACKLIST_CACHE = new Set([
  "malicious-updates.example",
  "credential-harvest.example",
  "198.51.100.42",
  "phish-payments.example",
]);

const URGENCY_KEYWORDS = [
  /suspended/i,
  /urgent/i,
  /kyc/i,
  /prize/i,
  /immediately/i,
  /blocked/i,
  /verify now/i,
  /final warning/i,
];

const TYPO_PATTERNS = [
  /g00gle/i,
  /paypa[l1]/i,
  /micr0soft/i,
  /amaz0n/i,
  /faceb00k/i,
];

function normalizeInput(data = {}) {
  return {
    notificationHeader: String(data.notificationHeader || data.senderId || ""),
    messageText: String(data.messageText || data.message || ""),
    url: String(data.url || ""),
    fileExtension: String(data.fileExtension || data.fileName || ""),
  };
}

function getDomain(urlString = "") {
  try {
    return new URL(urlString).hostname.toLowerCase();
  } catch (_err) {
    return "";
  }
}

function getExtension(fileExtensionOrName = "") {
  const cleaned = fileExtensionOrName.replace(/^\./, "").trim().toLowerCase();
  if (!cleaned) return "";
  if (cleaned.includes(".")) {
    return cleaned.split(".").pop();
  }
  return cleaned;
}

function hashTrace(data) {
  return crypto
    .createHash("sha256")
    .update(`${data.notificationHeader}|${data.messageText}|${data.url}|${data.fileExtension}`)
    .digest("hex")
    .slice(0, 12);
}

async function checkPatterns(data) {
  const source = `${data.notificationHeader} ${data.messageText}`;
  const typoHits = TYPO_PATTERNS.filter((pattern) => pattern.test(source)).length;

  let score = Math.min(60, typoHits * 20);

  if (/[\u0400-\u04FF]/.test(source)) {
    score += 18;
  }

  return {
    score: Math.min(100, score),
    typoHits,
    visualTampering: score > 0,
  };
}

async function checkUrgency(data) {
  const urgencyHits = URGENCY_KEYWORDS.filter((pattern) => pattern.test(data.messageText)).length;
  const punctuationBursts = (data.messageText.match(/[!?]{2,}/g) || []).length;

  const score = Math.min(100, (urgencyHits * 14) + (punctuationBursts * 5));

  return {
    score,
    urgencyHits,
    triggerWords: urgencyHits > 0,
  };
}

async function checkSafeLinks(data) {
  const domain = getDomain(data.url);
  const ext = getExtension(data.fileExtension);
  const blacklisted = BLACKLIST_CACHE.has(domain);
  const riskyFile = HIGH_RISK_FILE_TYPES.has(ext);

  let score = 0;
  if (blacklisted) score += 55;
  if (riskyFile) score += 35;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(domain)) score += 15;

  return {
    score: Math.min(100, score),
    domain,
    extension: ext,
    blacklisted,
    riskyFile,
  };
}

function calculateRiskScore(l1, l2, l3) {
  const w1 = 0.35;
  const w2 = 0.30;
  const w3 = 0.35;

  return Math.round((w1 * l1.score) + (w2 * l2.score) + (w3 * l3.score));
}

async function analyzeSignal(rawData = {}) {
  const start = performance.now();
  const data = normalizeInput(rawData);

  const [layer1, layer2, layer3] = await Promise.all([
    checkPatterns(data),
    checkUrgency(data),
    checkSafeLinks(data),
  ]);

  const totalScore = calculateRiskScore(layer1, layer2, layer3);
  const strikeRed = totalScore > 75;

  const end = performance.now();

  return {
    traceId: hashTrace(data),
    totalScore,
    response: strikeRed ? "STRIKE_RED" : totalScore >= 45 ? "CAUTION_AMBER" : "SAFE_GREEN",
    strikeRed,
    layers: {
      patternMatching: layer1,
      linguisticUrgency: layer2,
      sandboxCheck: layer3,
    },
    latencyMs: Number((end - start).toFixed(2)),
    guidance: strikeRed
      ? "High-confidence scam pattern detected. Block action immediately."
      : totalScore >= 45
        ? "Suspicious indicators detected. Require user confirmation."
        : "No strong scam indicators detected.",
  };
}

module.exports = {
  analyzeSignal,
  checkPatterns,
  checkUrgency,
  checkSafeLinks,
};
