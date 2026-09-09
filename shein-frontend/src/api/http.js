// src/api/http.js
import { getToken, triggerSessionExpired } from "../utils/auth";

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
  const apiError = data?.error;
  const apiMsg = typeof apiError === "object" ? apiError?.message : apiError || data?.detail || data?.message;
  const bodyMsg = (rawText || "").trim();
  const shortBody = bodyMsg.length > 300 ? `${bodyMsg.slice(0, 300)}...` : bodyMsg;

  if (apiMsg) return `${statusPart}: ${apiMsg}`;
  if (shortBody) return `${statusPart}: ${shortBody}`;
  return statusPart;
}

export async function apiFetch(url, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.headers || {}),
  };

  if (!(typeof FormData !== "undefined" && options.body instanceof FormData)) headers["Content-Type"] = "application/json";

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

  // A forbidden operation is a permission result, not an expired session.
  if (res.status === 401) {
    triggerSessionExpired();
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
    const errorMsg = String(typeof data.error === "object" ? data.error?.message : data.error || data.detail || "").toLowerCase();
    if (
      errorMsg.includes("invalid token") ||
      errorMsg.includes("expired token") ||
      errorMsg.includes("unauthorized")
    ) {
      triggerSessionExpired();
    }
    const err = new Error(typeof data.error === "object" ? data.error?.message || "Request failed" : data.error || data.detail || "Request failed");
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
