const API_BASE = "http://localhost:8080";

function readCookie(name) {
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(name + "="));
  return cookie ? cookie.split("=")[1] : "";
}

export async function bootstrapCsrf() {
  await fetch(`${API_BASE}/api/csrf-token`, {
    method: "GET",
    credentials: "include",
  });
}

export async function analyzeTelemetry(payload) {
  const token = readCookie("digiguard_csrf");
  const response = await fetch(`${API_BASE}/api/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": token,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Analyze request failed");
  }

  return response.json();
}

export function openLiveSocket(onRiskUpdate) {
  const ws = new WebSocket("ws://localhost:8080/ws");
  ws.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "risk-update") {
        onRiskUpdate(data.payload);
      }
    } catch (_err) {
      // Ignore malformed payloads.
    }
  });

  return ws;
}
