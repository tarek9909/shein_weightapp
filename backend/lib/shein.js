const path = require("path");
const { observeScraper } = require("./observability");

const normEmail = (value) => {
  let v = String(value ?? "").trim().toLowerCase();
  if (v.includes("@")) {
    const [local, domain] = v.split("@", 2);
    if (local && domain && !domain.includes(".")) v = `${local}@${domain}.com`;
  }
  return v;
};

function localApiBase() {
  return String(process.env.SHEIN_LOCAL_API_BASE_URL || "http://127.0.0.1:8000").trim().replace(/\/$/, "");
}

async function callSheinScraper(action, payload) {
  const routes = { track_one: "/api/direct/track_one", weight_one: "/api/direct/weight_one", weight_many: "/api/direct/weight_many" };
  if (!routes[action]) return { ok: false, error: `Unsupported scraper action: ${action}`, status: 400 };
  const base = localApiBase();
  const token = String(process.env.SHEIN_LOCAL_API_TOKEN || "").trim();
  if (token.length < 32) return { ok: false, error: "SHEIN_LOCAL_API_TOKEN is not configured", status: 503 };
  const started = Date.now();
  try {
    const headers = { Accept: "application/json", "X-Internal-Token": token };
    const pingController = new AbortController();
    const pingTimer = setTimeout(() => pingController.abort(), 5000);
    let ping;
    try { ping = await fetch(`${base}/ping`, { headers, signal: pingController.signal }); }
    finally { clearTimeout(pingTimer); }
    const pingData = await ping.json().catch(() => null);
    if (!ping.ok || !pingData?.ok) { observeScraper(action, Date.now() - started, false); return { ok: false, error: `Local scraper API is unavailable at ${base}/ping`, status: 503 }; }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(`${base}${routes[action]}`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!data || !response.ok || !data.ok) { observeScraper(action, Date.now() - started, false); return { ok: false, error: data?.error || data?.detail || "Local scraper API request failed", data, status: response.status || 500 }; }
      observeScraper(action, Date.now() - started, true);
      return { ok: true, data, status: response.status };
    } finally { clearTimeout(timer); }
  } catch (error) {
    observeScraper(action, Date.now() - started, false);
    return { ok: false, error: error.name === "AbortError" ? "Local scraper API request timed out" : error.message, status: 503 };
  }
}

function defaultProfileKey(userId, apiEmail, selected) {
  return selected || `user_${userId}_${apiEmail.replace(/[^a-z0-9_]+/gi, "_")}`;
}

module.exports = { normEmail, callSheinScraper, defaultProfileKey };
