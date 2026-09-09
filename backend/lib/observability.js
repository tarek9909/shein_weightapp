const crypto = require("crypto");

const counters = {
  requests: 0,
  requestErrors: 0,
  scraperCalls: 0,
  scraperFailures: 0,
  scraperDurationMs: 0,
};

function requestId(req) {
  const supplied = String(req.get("x-request-id") || "").trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function requestMetrics(req, res, next) {
  const id = requestId(req);
  const started = process.hrtime.bigint();
  req.requestId = id;
  res.setHeader("X-Request-Id", id);
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    counters.requests += 1;
    if (res.statusCode >= 500) counters.requestErrors += 1;
    console.log(JSON.stringify({
      event: "http_request",
      request_id: id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Math.round(durationMs * 100) / 100,
    }));
  });
  next();
}

function observeScraper(action, durationMs, ok) {
  counters.scraperCalls += 1;
  counters.scraperDurationMs += durationMs;
  if (!ok) counters.scraperFailures += 1;
}

function metricsSnapshot() {
  return {
    ...counters,
    averageScraperDurationMs: counters.scraperCalls
      ? Math.round((counters.scraperDurationMs / counters.scraperCalls) * 100) / 100
      : 0,
  };
}

module.exports = { requestMetrics, observeScraper, metricsSnapshot };
