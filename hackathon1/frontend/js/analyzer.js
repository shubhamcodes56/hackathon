const API_BASE = "";
let debounceTimer;
const TARGET_PACKAGES = new Set(["com.whatsapp", "com.android.mms"]);

function readCookie(name) {
  const cookie = document.cookie.split("; ").find((row) => row.startsWith(name + "="));
  return cookie ? cookie.split("=")[1] : "";
}

async function bootstrapCsrf() {
  await fetch(`${API_BASE}/api/csrf-token`, {
    method: "GET",
    credentials: "include",
  });
}

function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : "";
}

function extractFileExtension(text) {
  const match = text.match(/\.([a-z0-9]{2,5})\b/i);
  return match ? `.${match[1].toLowerCase()}` : "";
}

function setStatus(message) {
  const node = document.getElementById("status-text");
  if (node) node.textContent = message;
}

function setLocalFlag(message, isWarning) {
  const node = document.getElementById("local-flag");
  if (!node) return;
  node.textContent = message;
  node.className = isWarning ? "font-bold text-red-700" : "font-bold text-slate-700";
}

function renderResult(result) {
  const fraud = Math.max(0, Math.min(100, result.totalScore || 0));
  const security = 100 - fraud;

  const fraudPercent = document.getElementById("fraud-percent");
  const securityPercent = document.getElementById("security-percent");
  const fraudBar = document.getElementById("fraud-bar");
  const securityBar = document.getElementById("security-bar");

  if (fraudPercent) fraudPercent.textContent = `${fraud}%`;
  if (securityPercent) securityPercent.textContent = `${security}%`;
  if (fraudBar) fraudBar.style.width = `${fraud}%`;
  if (securityBar) securityBar.style.width = `${security}%`;

  document.getElementById("l1-score").textContent = String(result.layers?.patternMatching?.score || 0);
  document.getElementById("l2-score").textContent = String(result.layers?.linguisticUrgency?.score || 0);
  document.getElementById("l3-score").textContent = String(result.layers?.sandboxCheck?.score || 0);

  const decision = document.getElementById("decision-text");
  const guidance = document.getElementById("guidance-text");
  if (decision) {
    decision.textContent = result.response || "SAFE_GREEN";
    decision.className = "text-lg font-extrabold " + (result.strikeRed ? "text-red-600" : result.response === "CAUTION_AMBER" ? "text-amber-600" : "text-emerald-600");
  }
  if (guidance) guidance.textContent = result.guidance || "No guidance available.";
}

async function analyzeNotification() {
  try {
    const packageName = (document.getElementById("package-input")?.value || "").trim();
    const permissionEnabled = Boolean(document.getElementById("permission-toggle")?.checked);
    const previewEnabled = Boolean(document.getElementById("preview-toggle")?.checked);
    const sender = (document.getElementById("sender-input")?.value || "").trim();
    const notificationInput = document.getElementById("notification-input");
    const urlInput = document.getElementById("url-input");
    const fileInput = document.getElementById("file-input");

    const messageText = (notificationInput?.value || "").trim();
    const urlValue = (urlInput?.value || "").trim();
    const fileValue = (fileInput?.value || "").trim();

    if (!messageText) {
      setStatus("Paste notification text to analyze.");
      return;
    }

    if (!permissionEnabled) {
      setStatus("Notification Access is disabled. Enable permission first.");
      setLocalFlag("Permission missing", true);
      return;
    }

    if (!previewEnabled) {
      setStatus("Notification preview is unavailable. Cannot read content.");
      setLocalFlag("No preview available", true);
      return;
    }

    if (!TARGET_PACKAGES.has(packageName)) {
      setStatus(`Ignored package: ${packageName}. Listener scans only WhatsApp/SMS.`);
      setLocalFlag("Ignored app package", false);
      renderResult({
        totalScore: 0,
        response: "SAFE_GREEN",
        strikeRed: false,
        guidance: "This app package is outside scanner scope.",
        layers: {
          patternMatching: { score: 0 },
          linguisticUrgency: { score: 0 },
          sandboxCheck: { score: 0 },
        },
      });
      return;
    }

    const lower = messageText.toLowerCase();
    const localTrigger = ["urgent", "click", "suspended", "kyc", "prize"].some((key) => lower.includes(key));
    setLocalFlag(localTrigger ? "Possible scam trigger found" : "No local trigger", localTrigger);

    const payload = {
      notificationHeader: sender || "User Pasted Notification",
      messageText,
      url: urlValue || extractUrl(messageText),
      fileExtension: fileValue || extractFileExtension(messageText),
    };

    const csrfToken = readCookie("digiguard_csrf");

    setStatus("Analyzing...");

    const response = await fetch(`${API_BASE}/api/analyze/signal`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error:", response.status, errorText);
      setStatus(`Backend error (${response.status}). Please retry.`);
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    renderResult(result);
    setStatus(`Completed in ${result.latencyMs || "?"}ms`);
  } catch (error) {
    console.error("Analysis error:", error);
    setStatus("Analysis failed. Backend may be unavailable. Please retry.");
  }
}

async function simulateNotificationPosted() {
  setStatus("Listener triggered. Processing notification...");
  await analyzeNotification();
}

function scheduleAutoAnalyze() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    analyzeNotification().catch(() => setStatus("Backend unavailable. Please retry."));
  }, 450);
}

function clearForm() {
  const senderInput = document.getElementById("sender-input");
  const notificationInput = document.getElementById("notification-input");
  const urlInput = document.getElementById("url-input");
  const fileInput = document.getElementById("file-input");
  const packageInput = document.getElementById("package-input");
  const permToggle = document.getElementById("permission-toggle");
  const previewToggle = document.getElementById("preview-toggle");

  if (senderInput) senderInput.value = "";
  if (notificationInput) notificationInput.value = "";
  if (urlInput) urlInput.value = "";
  if (fileInput) fileInput.value = "";
  if (packageInput) packageInput.value = "com.whatsapp";
  if (permToggle) permToggle.checked = true;
  if (previewToggle) previewToggle.checked = true;

  setLocalFlag("No trigger", false);
  renderResult({
    totalScore: 0,
    response: "SAFE_GREEN",
    strikeRed: false,
    guidance: "No strong scam indicators detected.",
    layers: {
      patternMatching: { score: 0 },
      linguisticUrgency: { score: 0 },
      sandboxCheck: { score: 0 },
    },
  });
  setStatus("Cleared. Ready for new analysis.");
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await bootstrapCsrf();
    setStatus("Connected to backend. Ready to analyze.");
  } catch (_err) {
    console.error("CSRF bootstrap failed:", _err);
    setStatus("Backend connection issue. Will retry on analysis.");
  }

  const notificationInput = document.getElementById("notification-input");
  const analyzeBtn = document.getElementById("analyze-now-btn");
  const simulateBtn = document.getElementById("simulate-btn");
  const clearBtn = document.getElementById("clear-btn");
  const urlInput = document.getElementById("url-input");
  const fileInput = document.getElementById("file-input");
  const senderInput = document.getElementById("sender-input");
  const packageInput = document.getElementById("package-input");

  if (!notificationInput || !analyzeBtn || !simulateBtn || !clearBtn) {
    console.error("Missing required DOM elements");
    return;
  }

  // Auto-analyze on input
  notificationInput.addEventListener("input", scheduleAutoAnalyze);
  notificationInput.addEventListener("paste", scheduleAutoAnalyze);

  if (urlInput) urlInput.addEventListener("input", scheduleAutoAnalyze);
  if (fileInput) fileInput.addEventListener("input", scheduleAutoAnalyze);
  if (senderInput) senderInput.addEventListener("input", scheduleAutoAnalyze);
  if (packageInput) packageInput.addEventListener("change", scheduleAutoAnalyze);

  // Button click handlers
  analyzeBtn.addEventListener("click", () => {
    console.log("Analyze Now button clicked");
    analyzeNotification().catch((err) => {
      console.error("Analyze error:", err);
      setStatus("Backend unavailable. Please try again.");
    });
  });

  simulateBtn.addEventListener("click", () => {
    console.log("Simulate button clicked");
    simulateNotificationPosted().catch((err) => {
      console.error("Simulate error:", err);
      setStatus("Simulation failed. Please try again.");
    });
  });

  clearBtn.addEventListener("click", () => {
    console.log("Clear button clicked");
    clearForm();
  });

  // Initialize display
  setLocalFlag("No trigger", false);
  console.log("Analyzer initialized successfully");
});
