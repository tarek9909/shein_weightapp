const jwt = require("jsonwebtoken");
const { pool } = require("../config/db");

const secret = () => process.env.JWT_SECRET || process.env.AUTH_SECRET || "CHANGE_THIS_SECRET_123";

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
    return pool.execute("SELECT id, username FROM users WHERE id=? LIMIT 1", [userId])
      .then(([rows]) => {
        if (!rows[0]) return res.status(401).json({ ok: false, error: "Invalid token" });
        req.user = { ...payload, user_id: userId, username: payload.username || rows[0].username };
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
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  }, secret(), { algorithm: "HS256", noTimestamp: true });
}

module.exports = { requireAuth, createToken, jwtSecret: secret };
