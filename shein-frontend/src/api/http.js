// src/api/http.js

function toText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildErrorMessage(res, data, rawText) {
  const statusPart = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
  const apiMsg = data?.error || data?.detail || data?.message;
  const bodyMsg = (rawText || "").trim();
  const shortBody = bodyMsg.length > 300 ? `${bodyMsg.slice(0, 300)}...` : bodyMsg;

  if (apiMsg) return `${statusPart}: ${apiMsg}`;
  if (shortBody) return `${statusPart}: ${shortBody}`;
  return statusPart;
}

export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    ...(options.headers || {}),
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  // Always fail hard on non-2xx and include backend body in message.
  if (!res.ok) {
    const err = new Error(buildErrorMessage(res, data, text));
    err.status = res.status;
    err.payload = data;
    err.raw = text;
    throw err;
  }

  // 2xx but backend app-level error.
  if (data && (data.ok === false || data.success === false)) {
    const err = new Error(data.error || data.detail || "Request failed");
    err.status = res.status;
    err.payload = data;
    err.raw = text;
    throw err;
  }

  // 2xx but non-JSON body.
  if (data === null && text) {
    const err = new Error(`Invalid JSON response: ${toText(text).slice(0, 300)}`);
    err.status = res.status;
    err.raw = text;
    throw err;
  }

  return data;
}
