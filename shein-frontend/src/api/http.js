// src/api/http.js

export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("token");

  const headers = {
    ...(options.headers || {}),
    "Content-Type": "application/json",
  };

  // attach token
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  // Try parse JSON always (even on 401)
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { ok: false, error: "Invalid JSON response", raw: text };
  }

  // If unauthorized, throw special error so pages can redirect
  if (res.status === 401) {
    const err = new Error(data?.error || "Unauthorized");
    err.status = 401;
    err.payload = data;
    throw err;
  }

  // If server error returned ok:false
  if (data && (data.ok === false || data.success === false)) {
    const err = new Error(data.error || "Request failed");
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}
