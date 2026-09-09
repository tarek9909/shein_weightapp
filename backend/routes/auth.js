const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { requireAuth, createToken } = require("../middleware/auth");
const { asyncHandler, paths, trim, HttpError, first, execute } = require("../lib/helpers");

const router = express.Router();

router.post(paths("login", true), asyncHandler(async (req, res) => {
  const username = trim(req.body?.username);
  const password = String(req.body?.password ?? "");
  if (!username || !password) return res.status(400).json({ ok: false, error: "Username and password required" });
  const user = await first(pool, "SELECT id, username, password_hash FROM users WHERE username=? LIMIT 1", [username]);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }
  return res.json({ ok: true, token: createToken(user), user: { id: Number(user.id), username: user.username } });
}));

router.post(paths("register", true), asyncHandler(async (req, res) => {
  const username = trim(req.body?.username);
  const password = String(req.body?.password ?? "");
  if (!username || !password) return res.status(400).json({ ok: false, error: "Username and password required" });
  if (password.length < 6) return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
  const hash = await bcrypt.hash(password, 10);
  try {
    const result = await execute(pool, "INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, hash]);
    return res.json({ ok: true, id: Number(result.insertId), message: "Registered" });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "Username already exists" });
    throw error;
  }
}));

router.post(paths("resetPassword"), requireAuth, asyncHandler(async (req, res) => {
  const userId = Number(req.user.user_id || 0);
  const oldPassword = String(req.body?.old_password ?? "");
  const newPassword = String(req.body?.new_password ?? "");
  const confirmPassword = String(req.body?.confirm_password ?? "");
  if (!userId) throw new HttpError(401, "Unauthorized", { ok: false, error: "Unauthorized" });
  if (!oldPassword || !newPassword || !confirmPassword) return res.status(400).json({ ok: false, error: "All fields are required" });
  if (newPassword !== confirmPassword) return res.status(400).json({ ok: false, error: "Passwords do not match" });
  if (newPassword.length < 6) return res.status(400).json({ ok: false, error: "New password must be at least 6 characters" });
  const user = await first(pool, "SELECT password_hash FROM users WHERE id=? LIMIT 1", [userId]);
  if (!user) return res.status(404).json({ ok: false, error: "User not found" });
  if (!(await bcrypt.compare(oldPassword, user.password_hash))) return res.status(401).json({ ok: false, error: "Old password is incorrect" });
  const hash = await bcrypt.hash(newPassword, 10);
  await execute(pool, "UPDATE users SET password_hash=? WHERE id=?", [hash, userId]);
  return res.json({ ok: true, message: "Password updated" });
}));

module.exports = router;
