const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const authRoutes = require("./routes/auth");
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

const app = express();
const corsOptions = {
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
// A few existing frontend helpers concatenate a trailing slash with another
// slash. Normalize that request spelling while preserving the PHP route names.
app.use((req, _res, next) => {
  req.url = req.url.replace(/\/{2,}/g, "/");
  next();
});
app.use(express.json({ limit: process.env.JSON_LIMIT || "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.get(["/", "/health", "/healthz"], (_req, res) => res.json({ ok: true, service: "shein-backend-node" }));

app.use("/auth", authRoutes);
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
app.use("/cargo", cargoRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/losses", lossRoutes);

app.use((req, res) => res.status(404).json({ ok: false, error: "Endpoint not found" }));
app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.too.large") return res.status(413).json({ ok: false, error: "Request body too large" });
  if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ ok: false, error: "Invalid JSON body" });
  const status = Number(error?.status) >= 400 ? Number(error.status) : 500;
  if (status >= 500) {
    console.error("[shein-node] Unhandled request error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
  const body = error?.body || { ok: false, error: error?.message || "Request failed" };
  return res.status(status).json(body);
});

const port = Number(process.env.PORT || 8081);
if (require.main === module) {
  const server = app.listen(port, "0.0.0.0", () => console.log(`Node backend listening on 0.0.0.0:${port}`));
  server.on("error", (error) => {
    console.error(`[shein-node] Unable to listen on port ${port}`, error);
    process.exitCode = 1;
  });
}

module.exports = app;
