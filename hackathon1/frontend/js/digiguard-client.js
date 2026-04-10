const API_BASE = "";

function readCookie(name) {
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return cookie ? cookie.split("=")[1] : "";
}

function showActionStatus(message) {
  let statusNode = document.getElementById("action-status");

  if (!statusNode) {
    statusNode = document.createElement("div");
    statusNode.id = "action-status";
    statusNode.className = "fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-sm px-4 py-2 rounded-lg shadow-xl";
    document.body.appendChild(statusNode);
  }

  statusNode.textContent = message;
  statusNode.style.opacity = "1";

  clearTimeout(showActionStatus._timer);
  showActionStatus._timer = setTimeout(() => {
    statusNode.style.opacity = "0";
  }, 2500);
}

async function bootstrapCsrf() {
  await fetch(`${API_BASE}/api/csrf-token`, {
    method: "GET",
    credentials: "include",
  });
}

function mapRiskToUi(result) {
  const response = result.response || "SAFE_GREEN";
  const risk = response === "STRIKE_RED" ? "high" : response === "CAUTION_AMBER" ? "medium" : "low";
  const score = result.totalScore || 0;
  const warning = Boolean(result.strikeRed);

  return {
    risk,
    score,
    warning,
    ringClass: risk === "high" ? "ring-red-500" : risk === "medium" ? "ring-amber-400" : "ring-green-500",
    badgeClass: risk === "high" ? "bg-red-500 text-white" : risk === "medium" ? "bg-amber-400 text-black" : "bg-green-500 text-white",
  };
}

function updateRiskUi(mapped, result) {
  const riskBadge = document.getElementById("risk-badge");
  const riskScore = document.getElementById("risk-score");
  const riskAdvice = document.getElementById("risk-advice");
  const demoCard = document.getElementById("risk-card");

  if (!riskBadge || !riskScore || !riskAdvice || !demoCard) return;

  riskBadge.className = `inline-block px-3 py-1 rounded-full text-xs font-bold mb-6 ${mapped.badgeClass}`;
  riskBadge.textContent = `Risk Level: ${mapped.risk.toUpperCase()}`;

  riskScore.textContent = `Score: ${mapped.score}`;
  riskAdvice.textContent = result.guidance || result.advice || "No guidance available.";

  demoCard.classList.remove("ring-red-500", "ring-amber-400", "ring-green-500");
  demoCard.classList.add(mapped.ringClass);

  if (mapped.warning) {
    demoCard.classList.add("animate-pulse");
  } else {
    demoCard.classList.remove("animate-pulse");
  }
}

async function analyzeSignalTelemetry() {
  const payload = {
    notificationHeader: "A1",
    messageText: "URGENT: Your account is suspended. Complete KYC immediately to claim prize access now!!!",
    url: "https://198.51.100.42/login",
    fileExtension: ".apk",
  };

  const csrfToken = readCookie("digiguard_csrf");

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
    throw new Error("Failed to analyze telemetry");
  }

  return response.json();
}

function scrollToTarget(selector) {
  const target = document.querySelector(selector);
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runInterceptCheck() {
  const csrfToken = readCookie("digiguard_csrf");
  const payload = {
    notificationHeader: "Payment Security",
    messageText: "URGENT KYC suspended. Verify now to unlock your prize!!!",
    url: "http://198.51.100.42/login",
    fileExtension: ".apk",
  };

  const response = await fetch(`${API_BASE}/api/intercept`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrfToken,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Intercept request failed");
  }

  return response.json();
}

function connectLiveSocket() {
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws`);
  ws.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type !== "risk-update") return;

      const mapped = mapRiskToUi(data.payload);
      updateRiskUi(mapped, data.payload);
    } catch (_err) {
      // Ignore malformed event payloads from external senders.
    }
  });

  return ws;
}

async function initDigiGuardDemo() {
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      scrollToTarget(button.getAttribute("data-scroll-target"));
    });
  });

  const analyzeBtn = document.getElementById("analyze-btn");
  if (analyzeBtn) {
    analyzeBtn.addEventListener("click", async () => {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = "Analyzing...";

      try {
        const result = await analyzeSignalTelemetry();
        const mapped = mapRiskToUi(result);
        updateRiskUi(mapped, result);
        showActionStatus("Onion analysis complete.");
      } catch (_err) {
        const riskAdvice = document.getElementById("risk-advice");
        if (riskAdvice) {
          riskAdvice.textContent = "Unable to reach security engine. Check backend connection.";
        }
        showActionStatus("Analysis failed.");
      } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Run Onion Analysis";
      }
    });
  }

  const openLinkBtn = document.getElementById("open-link-btn");
  if (openLinkBtn) {
    openLinkBtn.addEventListener("click", async () => {
      try {
        const result = await analyzeSignalTelemetry();
        const mapped = mapRiskToUi(result);
        updateRiskUi(mapped, result);
        showActionStatus(result.strikeRed ? "Unsafe link blocked by DigiGuard." : "Link passed pre-check.");
      } catch (_err) {
        showActionStatus("Unable to run link pre-check.");
      }
    });
  }

  const proceedBtn = document.getElementById("proceed-btn");
  if (proceedBtn) {
    proceedBtn.addEventListener("click", async () => {
      try {
        const { block, result } = await runInterceptCheck();
        const mapped = mapRiskToUi(result);
        updateRiskUi(mapped, result);
        showActionStatus(block ? "Action blocked due to high scam risk." : "Proceed allowed after checks.");
      } catch (_err) {
        showActionStatus("Intercept check unavailable.");
      }
    });
  }

  const enableBtn = document.getElementById("enable-btn");
  if (enableBtn) {
    enableBtn.addEventListener("click", async () => {
      try {
        await bootstrapCsrf();
        showActionStatus("Protection enabled for this session.");
      } catch (_err) {
        showActionStatus("Backend unavailable. Retrying later.");
      }
      scrollToTarget("#live-demo");
    });
  }

  const publicBtn = document.getElementById("public-btn");
  if (publicBtn) {
    publicBtn.addEventListener("click", () => {
      window.open("https://github.com/shubhamcodes56/hackathon1", "_blank", "noopener,noreferrer");
    });
  }

  const shareBtn = document.getElementById("share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const shareData = {
        title: "DigiGuard",
        text: "Real-time scam prevention with Onion-layer protection.",
        url: window.location.href,
      };

      if (navigator.share) {
        try {
          await navigator.share(shareData);
          showActionStatus("Shared successfully.");
          return;
        } catch (_err) {
          // Fallback to clipboard.
        }
      }

      try {
        await navigator.clipboard.writeText(window.location.href);
        showActionStatus("Link copied to clipboard.");
      } catch (_err) {
        showActionStatus("Share unavailable on this browser.");
      }
    });
  }

  try {
    await bootstrapCsrf();
    connectLiveSocket();
  } catch (_err) {
    showActionStatus("Live protection channel unavailable.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initDigiGuardDemo().catch(() => {
    // Keep landing page functional even if backend is down.
  });
});
