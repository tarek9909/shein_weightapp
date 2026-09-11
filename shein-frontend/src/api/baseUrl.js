const FALLBACK_API_PORT = "8081";
const DEFAULT_API_ORIGIN = `http://127.0.0.1:${FALLBACK_API_PORT}`;

export function buildBrowserApiOrigin() {
  if (typeof window === "undefined") {
    return DEFAULT_API_ORIGIN;
  }

  const { protocol, hostname, port, origin } = window.location;
  // If running in production (served by Nginx/HTTPS or standard HTTP ports) or port matches backend port:
  if (port === "" || port === "80" || port === "443" || port === FALLBACK_API_PORT) {
    return origin;
  }

  // If in local React dev mode (e.g. running on localhost:3000):
  return `${protocol}//${hostname}:${FALLBACK_API_PORT}`;
}

export function normalizeConfiguredOrigin(value) {
  if (typeof window === "undefined") {
    return value || DEFAULT_API_ORIGIN;
  }

  if (!value) {
    return buildBrowserApiOrigin();
  }

  try {
    const url = new URL(value);
    const isLoopbackHost =
      url.hostname === "127.0.0.1" ||
      url.hostname === "localhost" ||
      url.hostname === "0.0.0.0";

    if (!isLoopbackHost) {
      return url.origin;
    }

    return buildBrowserApiOrigin();
  } catch {
    return buildBrowserApiOrigin();
  }
}

export const API_ORIGIN = normalizeConfiguredOrigin(
  process.env.REACT_APP_BASE_URL
);

