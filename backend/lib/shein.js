const path = require("path");

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
  try {
    const ping = await fetch(`${base}/ping`);
    const pingData = await ping.json().catch(() => null);
    if (!ping.ok || !pingData?.ok) return { ok: false, error: `Local scraper API is unavailable at ${base}/ping`, status: 503 };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(`${base}${routes[action]}`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!data || !response.ok || !data.ok) return { ok: false, error: data?.error || data?.detail || "Local scraper API request failed", data, status: response.status || 500 };
      return { ok: true, data, status: response.status };
    } finally { clearTimeout(timer); }
  } catch (error) {
    return { ok: false, error: error.name === "AbortError" ? "Local scraper API request timed out" : error.message, status: 503 };
  }
}

function defaultProfileKey(userId, apiEmail, selected) {
  return selected || `user_${userId}_${apiEmail.replace(/[^a-z0-9_]+/gi, "_")}`;
}

module.exports = { normEmail, callSheinScraper, defaultProfileKey };
