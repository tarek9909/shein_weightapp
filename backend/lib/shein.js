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

function remoteBrowserUrl() {
  const raw = String(process.env.SHEIN_REMOTE_BROWSER_URL || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    // Never send the VNC password (or another credential accidentally placed
    // in the browser URL) to the frontend or expose it in API responses.
    ["password", "passwd", "vnc_password", "token", "access_token"].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch (_) {
    return raw;
  }
}

function profileApiTimeoutMs() {
  const value = Number(process.env.SHEIN_PROFILE_API_TIMEOUT_MS || 10000);
  return Number.isFinite(value) && value >= 1000 ? value : 10000;
}

async function callSheinScraper(action, payload) {
  const routes = { track_one: "/api/direct/track_one", weight_one: "/api/direct/weight_one", weight_many: "/api/direct/weight_many" };
  if (!routes[action]) return { ok: false, error: `Unsupported scraper action: ${action}`, status: 400 };
  const base = localApiBase();
  const token = String(process.env.SHEIN_LOCAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || "").trim();
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
      const detail = data?.detail;
      const detailError = typeof detail === "object" ? detail?.error : detail;
      if (!data || !response.ok || !data.ok) {
        observeScraper(action, Date.now() - started, false);
        return {
          ok: false,
          error: data?.error || detailError || "Local scraper API request failed",
          code: data?.code || detail?.code,
          login_required: Boolean(data?.login_required || detail?.login_required),
          profile_key: data?.profile_key || detail?.profile_key,
          data,
          status: response.status || 500,
        };
      }
      observeScraper(action, Date.now() - started, true);
      return { ok: true, data, status: response.status };
    } finally { clearTimeout(timer); }
  } catch (error) {
    observeScraper(action, Date.now() - started, false);
    return { ok: false, error: error.name === "AbortError" ? "Local scraper API request timed out" : error.message, status: 503 };
  }
}

async function callSheinProfileApi(action, payload = {}) {
  const routes = {
    list: { method: "GET", path: "/api/profiles" },
    login_start: { method: "POST", path: "/api/profiles/login/start" },
    login_status: { method: "GET", path: "/api/profiles/login" },
    login_finish: { method: "POST", path: "/api/profiles/login/finish" },
    login_cancel: { method: "DELETE", path: "/api/profiles/login" },
  };
  const route = routes[action];
  if (!route) return { ok: false, error: `Unsupported profile action: ${action}`, status: 400 };

  const base = localApiBase();
  const token = String(process.env.SHEIN_LOCAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || "").trim();
  if (token.length < 32) return { ok: false, error: "SHEIN_LOCAL_API_TOKEN is not configured", status: 503 };

  let path = route.path;
  const options = {
    method: route.method,
    headers: { Accept: "application/json", "X-Internal-Token": token },
  };
  if (action === "login_status" || action === "login_cancel") {
    const sessionId = encodeURIComponent(String(payload.session_id || ""));
    if (!sessionId) return { ok: false, error: "session_id is required", status: 400 };
    path = `${path}/${sessionId}`;
  }
  if (route.method !== "GET") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(payload);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), profileApiTimeoutMs());
  options.signal = controller.signal;
  try {
    const response = await fetch(`${base}${path}`, options);
    const data = await response.json().catch(() => null);
    const detail = data?.detail;
    const detailError = typeof detail === "object" ? detail?.error : detail;
    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.error || detailError || "Python profile API request failed",
        code: data?.code || detail?.code,
        login_required: Boolean(data?.login_required || detail?.login_required),
        profile_key: data?.profile_key || detail?.profile_key,
        data,
        status: response.status || 500,
      };
    }
    return { ok: true, data, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error.name === "AbortError" ? "Python profile API request timed out" : error.message,
      status: 503,
    };
  } finally { clearTimeout(timer); }
}

async function callSheinRemoteBrowserApi(action, payload = {}) {
  const routes = {
    get_vnc_credentials: { method: "GET", path: "/api/remote-browser/credentials" },
    update_vnc_credentials: { method: "PUT", path: "/api/remote-browser/credentials" },
  };
  const route = routes[action];
  if (!route) return { ok: false, error: `Unsupported remote browser action: ${action}`, status: 400 };

  const base = localApiBase();
  const token = String(process.env.SHEIN_LOCAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || "").trim();
  if (token.length < 32) return { ok: false, error: "SHEIN_LOCAL_API_TOKEN is not configured", status: 503 };

  const options = { method: route.method, headers: { Accept: "application/json", "X-Internal-Token": token } };
  if (route.method !== "GET") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(payload);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), profileApiTimeoutMs());
  options.signal = controller.signal;
  try {
    const response = await fetch(`${base}${route.path}`, options);
    const data = await response.json().catch(() => null);
    const detail = data?.detail;
    const detailError = typeof detail === "object" ? detail?.error : detail;
    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.error || detailError || "Python remote browser API request failed",
        code: data?.code || detail?.code,
        data,
        status: response.status || 500,
      };
    }
    return { ok: true, data, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error.name === "AbortError" ? "Python remote browser API request timed out" : error.message,
      status: 503,
    };
  } finally { clearTimeout(timer); }
}

function defaultProfileKey(userId, apiEmail, selected) {
  return selected || `user_${userId}_${apiEmail.replace(/[^a-z0-9_]+/gi, "_")}`;
}

module.exports = { normEmail, callSheinScraper, callSheinProfileApi, callSheinRemoteBrowserApi, defaultProfileKey, remoteBrowserUrl };
