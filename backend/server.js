const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const frontendBuildPath = path.resolve(__dirname, "..", "shein-frontend", "build");
const hasFrontendBuild = fs.existsSync(frontendBuildPath);

const authRoutes = require("./routes/auth");
const customerRoutes = require("./routes/customers");
const monthRoutes = require("./routes/months");
const orderRoutes = require("./routes/orders");
const orderDetailsRoutes = require("./routes/ordersDetails");
const paymentRoutes = require("./routes/payments");
const customsRoutes = require("./routes/customs");
const budgetRoutes = require("./routes/budget");
const historyRoutes = require("./routes/history");
const settingsRoutes = require("./routes/settings");
const sheinAccountRoutes = require("./routes/sheinAccounts");
const deliveryRoutes = require("./routes/delivery");
const cargoRoutes = require("./routes/cargo");
const dashboardRoutes = require("./routes/dashboard");
const lossRoutes = require("./routes/losses");
const reportsRoutes = require("./routes/reports");
const { validateReceiveShipment } = require("./middleware/cargoValidation");
const { ensureRuntimeSchema, checkDatabase, checkTenantIntegrity, pool } = require("./config/db");
const { assertAuthConfig } = require("./middleware/auth");
const { requestMetrics, metricsSnapshot } = require("./lib/observability");

const app = express();
app.use(requestMetrics);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
const allowedOrigins = new Set(String(process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",").map((value) => value.trim()).filter(Boolean));
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has("*") || allowedOrigins.has(origin)) return callback(null, true);
    try {
      const parsedOrigin = new URL(origin);
      for (const allowed of allowedOrigins) {
        if (allowed === "*") return callback(null, true);
        try {
          const parsedAllowed = new URL(allowed);
          if (parsedAllowed.hostname === parsedOrigin.hostname) return callback(null, true);
        } catch (_) {}
      }
    } catch (_) {}
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  exposedHeaders: ["X-Request-Id"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

if (hasFrontendBuild) {
  app.use(express.static(frontendBuildPath, { maxAge: "1d" }));
}
// A few existing frontend helpers concatenate a trailing slash with another
// slash. Normalize that request spelling before dispatching Node routes.
app.use((req, _res, next) => {
  req.url = req.url.replace(/\/{2,}/g, "/");
  next();
});
app.use(express.json({ limit: process.env.JSON_LIMIT || "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use((_req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (body && typeof body === "object" && !Array.isArray(body) && Object.prototype.hasOwnProperty.call(body, "success") && !Object.prototype.hasOwnProperty.call(body, "ok")) {
      return sendJson({ ...body, ok: Boolean(body.success) });
    }
    return sendJson(body);
  };
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "shein-backend-node" }));
app.get(["/ready", "/healthz"], async (_req, res) => {
  try {
    await checkDatabase();
    res.json({ ok: true, service: "shein-backend-node", database: "ready" });
  } catch (_) {
    res.status(503).json({ ok: false, service: "shein-backend-node", database: "unavailable" });
  }
});
app.get("/metrics", (_req, res) => res.json({ ok: true, metrics: metricsSnapshot() }));

// If React build exists, serve index.html for browser page navigation
if (hasFrontendBuild) {
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    const accept = String(req.headers.accept || "");
    if (accept.includes("text/html") || req.path === "/") {
      return res.sendFile(path.join(frontendBuildPath, "index.html"));
    }
    next();
  });
}

app.use("/auth", authRoutes);
app.use("/customers", customerRoutes);
app.use("/month", monthRoutes);
app.use("/orders", orderRoutes);
app.use("/ordersDetails", orderDetailsRoutes);
app.use("/payments", paymentRoutes);
app.use("/customs", customsRoutes);
app.use("/budget", budgetRoutes);
app.use("/history", historyRoutes);
app.use("/settings", settingsRoutes);
app.use("/sheinAccounts", sheinAccountRoutes);
app.use("/delivery", deliveryRoutes);
app.use("/cargo", validateReceiveShipment, cargoRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/losses", lossRoutes);
app.use("/reports", reportsRoutes);

app.use((req, res) => res.status(404).json({ ok: false, error: "Endpoint not found" }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.too.large") return res.status(413).json({ ok: false, error: "Request body too large" });
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  const status = Number(error?.status) >= 400 ? Number(error.status) : 500;
  if (status >= 500) {
    console.error("[shein-node] Unhandled request error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
  const code = status === 400 ? "BAD_REQUEST" : status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "REQUEST_FAILED";
  const body = { ...(error?.body || { ok: false, error: error?.message || "Request failed" }), code, request_id: req.requestId };
  return res.status(status).json(body);
});

const port = Number(process.env.PORT || 8081);
const defaultHost = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";
const host = String(process.env.HOST || defaultHost).trim();

async function startServer() {
  assertAuthConfig();
  await ensureRuntimeSchema();
  await checkTenantIntegrity();
  const server = app.listen(port, host, () => console.log(`Node backend listening on ${host}:${port}`));
  server.on("error", (error) => {
    console.error(`[shein-node] Unable to listen on port ${port}`, error);
    process.exitCode = 1;
  });
  const shutdown = async () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("[shein-node] Startup checks failed", error);
    process.exit(1);
  });
}

module.exports = app;
module.exports.startServer = startServer;
