const FALLBACK_API_PORT = "8081";
const DEFAULT_API_ORIGIN = `http://127.0.0.1:${FALLBACK_API_PORT}`;

function buildBrowserApiOrigin() {
  if (typeof window === "undefined") {
    return DEFAULT_API_ORIGIN;
  }

  const { protocol, hostname, port } = window.location;
  if (port === FALLBACK_API_PORT || port === "" || port === "80" || port === "443") {
    return window.location.origin;
  }
  return `${protocol}//${hostname}:${FALLBACK_API_PORT}`;
}

function normalizeConfiguredOrigin(value) {
  if (!value) {
    return buildBrowserApiOrigin();
  }

  if (typeof window === "undefined") {
    return value;
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

    const browserUrl = new URL(buildBrowserApiOrigin());
    url.protocol = browserUrl.protocol;
    url.hostname = browserUrl.hostname;

    if (!url.port) {
      url.port = browserUrl.port;
    }

    return url.origin;
  } catch {
    return buildBrowserApiOrigin();
  }
}

export const API_ORIGIN = normalizeConfiguredOrigin(
  process.env.REACT_APP_BASE_URL || DEFAULT_API_ORIGIN
);
