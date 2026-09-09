// src/utils/auth.js

/**
 * Parses JWT payload safely and checks expiration.
 */
function parseJwt(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;

    // base64url to base64
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Checks if a JWT token is expired based on its 'exp' claim.
 */
export function isTokenExpired(token) {
  const payload = parseJwt(token);
  if (!payload) return true;
  if (!payload.exp) return false;
  // Exp is in seconds; allow 5 seconds buffer
  return payload.exp * 1000 <= Date.now() + 5000;
}

/**
 * Gets the current token from localStorage if valid and unexpired.
 */
export function getToken() {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("token");
  if (!token || token === "undefined" || token === "null") {
    return null;
  }
  if (isTokenExpired(token)) {
    clearAuthSession();
    return null;
  }
  return token;
}

/**
 * Returns true if user has a valid, unexpired session token.
 */
export function isAuthenticated() {
  return Boolean(getToken());
}

/**
 * Gets user object from localStorage.
 */
export function getUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("user");
    if (!raw || raw === "undefined" || raw === "null") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Stores authentication session in localStorage and broadcasts change.
 */
export function setAuthSession(token, user) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem("token", token);
  }
  if (user) {
    localStorage.setItem("user", typeof user === "string" ? user : JSON.stringify(user));
  }
  window.dispatchEvent(new CustomEvent("shein:auth-changed", { detail: { isAuthenticated: true, user } }));
}

/**
 * Clears session data from localStorage and broadcasts change.
 */
export function clearAuthSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.dispatchEvent(new CustomEvent("shein:auth-changed", { detail: { isAuthenticated: false, user: null } }));
}

/**
 * Signals that session has expired and navigates to login while preserving redirect path.
 */
export function triggerSessionExpired(fromPath) {
  if (typeof window === "undefined") return;
  clearAuthSession();

  const currentPath =
    fromPath ||
    (window.location.pathname + window.location.search);

  // Avoid redirect loops if already on login page
  if (window.location.pathname.startsWith("/login")) return;

  // Dispatch session expired event for React router navigation
  window.dispatchEvent(
    new CustomEvent("shein:session-expired", { detail: { from: currentPath } })
  );

  // Fallback direct navigation after a tick if React listener didn't catch it
  setTimeout(() => {
    if (!window.location.pathname.startsWith("/login")) {
      const target = `/login?redirect=${encodeURIComponent(currentPath)}`;
      window.location.replace(target);
    }
  }, 80);
}
