const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const INVALID_SECRETS = new Set(["", "CHANGE_THIS_SECRET_123", "change-me", "replace-me"]);

function secret() {
  const value = String(process.env.JWT_SECRET || process.env.AUTH_SECRET || "").trim();
  if (INVALID_SECRETS.has(value) || value.length < 32 || /change[_ -]?this|default|replace-me/i.test(value)) throw new Error("JWT_SECRET must be configured with a strong, non-default value");
  return value;
}

function assertAuthConfig() {
  secret();
}

function getToken(req) {
  const header = req.get("authorization") || req.get("Authorization");
  if (!header) return { error: "Missing Authorization header" };
  const value = String(header).trim();
  if (!value) return { error: "Missing token" };
  return { token: /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : value };
}

function requireAuth(req, res, next) {
  const { token, error } = getToken(req);
  if (error) return res.status(401).json({ ok: false, error });
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ["HS256"] });
    const userId = Number(payload?.user_id);
    if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid token payload");
    return pool.execute("SELECT id, username, role, owner_user_id, is_active, auth_version FROM users WHERE id=? LIMIT 1", [userId])
      .then(([rows]) => {
        if (!rows[0] || Number(rows[0].is_active) !== 1) return res.status(401).json({ ok: false, error: "Invalid or disabled account" });
        if (Number(payload.auth_version || 0) !== Number(rows[0].auth_version || 0)) return res.status(401).json({ ok: false, error: "Session expired" });
        req.user = {
          ...payload,
          user_id: userId,
          username: rows[0].username,
          role: rows[0].role || payload.role || "admin",
          owner_user_id: rows[0].owner_user_id == null ? null : Number(rows[0].owner_user_id),
          auth_version: Number(rows[0].auth_version || 0),
        };
        return next();
      })
      .catch(next);
  } catch (_) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

function createToken(user) {
  return jwt.sign({
    user_id: Number(user.id),
    username: user.username,
    role: user.role || "admin",
    auth_version: Number(user.auth_version || 0),
  }, secret(), { algorithm: "HS256", expiresIn: process.env.JWT_EXPIRES_IN || "8h", noTimestamp: true });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role || "admin";
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ ok: false, error: "You do not have permission to perform this action" });
    }
    return next();
  };
}

const requireAdmin = requireRole("admin");
const requireOperations = requireRole("admin", "operations");

function requireWriteAccess(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  return requireOperations(req, res, next);
}

module.exports = { requireAuth, requireRole, requireAdmin, requireOperations, requireWriteAccess, createToken, jwtSecret: secret, assertAuthConfig };
