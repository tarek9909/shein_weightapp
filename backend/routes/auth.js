const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const { requireAuth, requireAdmin, createToken } = require("../middleware/auth");
const { asyncHandler, paths, trim, HttpError, first, rows, execute } = require("../lib/helpers");
const { appendSecurityAudit } = require("../lib/activity");

const router = express.Router();
const MIN_PASSWORD_LENGTH = 12;
const DUMMY_HASH = "$2b$10$7EqJtq98hPqEX7fNZaFWoO5u2qV7s5zG4Z3V9Z3fVt8F3S8l1l1lG";
const attempts = new Map();

function accountView(row) {
  return {
    id: Number(row.id), username: row.username, role: row.role || "dashboard",
    owner_user_id: row.owner_user_id == null ? null : Number(row.owner_user_id),
    is_active: Number(row.is_active) === 1, created_at: row.created_at,
  };
}

function passwordError(password, label = "Password") {
  if (!password) return `${label} is required`;
  if (password.length < MIN_PASSWORD_LENGTH) return `${label} must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
}

function attemptKey(req, username) { return `${req.ip || "unknown"}:${username.toLowerCase()}`; }
function isRateLimited(key) {
  const item = attempts.get(key);
  if (!item || item.resetAt <= Date.now()) { attempts.delete(key); return false; }
  return item.count >= 5;
}
function recordFailure(key) {
  const current = attempts.get(key);
  if (!current || current.resetAt <= Date.now()) attempts.set(key, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
  else current.count += 1;
}

router.post(paths("login", true), asyncHandler(async (req, res) => {
  const username = trim(req.body?.username);
  const password = String(req.body?.password ?? "");
  if (!username || !password) return res.status(400).json({ ok: false, error: "Username and password required" });
  const key = attemptKey(req, username);
  if (isRateLimited(key)) return res.status(429).json({ ok: false, error: "Too many login attempts. Try again later." });
  const user = await first(pool, "SELECT id, username, password_hash, role, owner_user_id, is_active, auth_version FROM users WHERE username=? LIMIT 1", [username]);
  const validPassword = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user || Number(user.is_active) !== 1 || !validPassword) {
    recordFailure(key);
    await appendSecurityAudit(pool, null, user?.id ?? null, "login_failed", req.ip, { username });
    return res.status(401).json({ ok: false, error: "Invalid credentials" });
  }
  attempts.delete(key);
  await execute(pool, "UPDATE users SET last_login_at=NOW() WHERE id=?", [user.id]);
  await appendSecurityAudit(pool, user.id, user.id, "login_succeeded", req.ip, { username });
  return res.json({ ok: true, token: createToken(user), user: { ...accountView(user) } });
}));

router.post(paths("register"), requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const username = trim(req.body?.username);
  const password = String(req.body?.password ?? "");
  const role = trim(req.body?.role).toLowerCase() || "dashboard";
  if (!username || !password) return res.status(400).json({ ok: false, error: "Username and password required" });
  const passwordIssue = passwordError(password);
  if (passwordIssue) return res.status(400).json({ ok: false, error: passwordIssue });
  if (!/^[A-Za-z0-9_.-]{3,100}$/.test(username)) return res.status(400).json({ ok: false, error: "Username must be 3-100 characters and use only letters, numbers, dot, underscore, or hyphen" });
  if (!["dashboard", "operations"].includes(role)) return res.status(400).json({ ok: false, error: "Account type must be dashboard or operations" });
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = await execute(pool, "INSERT INTO users (username, password_hash, role, owner_user_id, is_active, auth_version) VALUES (?, ?, ?, ?, 1, 0)", [username, hash, role, Number(req.user.user_id)]);
    await appendSecurityAudit(pool, req.user.user_id, result.insertId, "managed_account_created", req.ip, { role });
    return res.status(201).json({ ok: true, id: Number(result.insertId), role, message: "Registered" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "Username already exists" });
    throw error;
  }
}));

router.get(paths("users"), requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const users = await rows(pool, "SELECT id, username, role, owner_user_id, is_active, created_at FROM users WHERE owner_user_id=? ORDER BY created_at DESC, id DESC", [Number(req.user.user_id)]);
  return res.json({ ok: true, users: users.map(accountView) });
}));

router.post(paths("users"), requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const username = trim(req.body?.username);
  const password = String(req.body?.password ?? "");
  const role = trim(req.body?.role).toLowerCase() || "dashboard";
  if (!username || !password) return res.status(400).json({ ok: false, error: "Username and password are required" });
  if (!/^[A-Za-z0-9_.-]{3,100}$/.test(username)) return res.status(400).json({ ok: false, error: "Username must be 3-100 characters and use only letters, numbers, dot, underscore, or hyphen" });
  const passwordIssue = passwordError(password);
  if (passwordIssue) return res.status(400).json({ ok: false, error: passwordIssue });
  if (!["dashboard", "operations"].includes(role)) return res.status(400).json({ ok: false, error: "Account type must be dashboard or operations" });
  const hash = await bcrypt.hash(password, 12);
  try {
    const result = await execute(pool, "INSERT INTO users (username, password_hash, role, owner_user_id, is_active, auth_version) VALUES (?, ?, ?, ?, 1, 0)", [username, hash, role, Number(req.user.user_id)]);
    await appendSecurityAudit(pool, req.user.user_id, result.insertId, "managed_account_created", req.ip, { role });
    const user = await first(pool, "SELECT id, username, role, owner_user_id, is_active, created_at FROM users WHERE id=? LIMIT 1", [result.insertId]);
    return res.status(201).json({ ok: true, user: accountView(user) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "Username already exists" });
    throw error;
  }
}));

async function ownedAccount(req, id) {
  return first(pool, "SELECT id,username,role,is_active,auth_version FROM users WHERE id=? AND owner_user_id=? LIMIT 1", [id, Number(req.user.user_id)]);
}

router.post(paths("updateUser"), requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.body?.id || 0);
  const role = trim(req.body?.role).toLowerCase();
  if (!Number.isSafeInteger(id) || id <= 0 || !["dashboard", "operations"].includes(role)) return res.status(400).json({ ok: false, error: "id and a valid account type are required" });
  const target = await ownedAccount(req, id);
  if (!target) return res.status(404).json({ ok: false, error: "Managed account not found" });
  await execute(pool, "UPDATE users SET role=?, auth_version=auth_version+1 WHERE id=? AND owner_user_id=?", [role, id, Number(req.user.user_id)]);
  await appendSecurityAudit(pool, req.user.user_id, id, "managed_account_role_changed", req.ip, { role });
  res.json({ ok: true, role });
}));

router.post(paths("disableUser"), requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.body?.id || 0);
  const target = await ownedAccount(req, id);
  if (!target) return res.status(404).json({ ok: false, error: "Managed account not found" });
  const rawActive = req.body?.is_active;
  if (![true, false, 0, 1, "0", "1", "true", "false"].includes(rawActive)) return res.status(400).json({ ok: false, error: "is_active must be a boolean" });
  const active = rawActive === true || rawActive === 1 || rawActive === "1" || rawActive === "true" ? 1 : 0;
  await execute(pool, "UPDATE users SET is_active=?, auth_version=auth_version+1 WHERE id=? AND owner_user_id=?", [active, id, Number(req.user.user_id)]);
  await appendSecurityAudit(pool, req.user.user_id, id, active ? "managed_account_enabled" : "managed_account_disabled", req.ip);
  res.json({ ok: true, is_active: Boolean(active) });
}));

router.delete(["/users/:id.php", "/users/:id"], requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.params.id || 0);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ ok: false, error: "A valid managed account id is required" });
  if (!(await ownedAccount(req, id))) return res.status(404).json({ ok: false, error: "Managed account not found" });
  await execute(pool, "UPDATE users SET is_active=0, auth_version=auth_version+1 WHERE id=? AND owner_user_id=?", [id, Number(req.user.user_id)]);
  await appendSecurityAudit(pool, req.user.user_id, id, "managed_account_deleted", req.ip, { soft_delete: true });
  res.json({ ok: true, is_active: false, deleted: true });
}));

router.post(paths("resetUserPassword"), requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const id = Number(req.body?.id || 0);
  const password = String(req.body?.password || "");
  const issue = passwordError(password, "New password");
  if (issue) return res.status(400).json({ ok: false, error: issue });
  if (!(await ownedAccount(req, id))) return res.status(404).json({ ok: false, error: "Managed account not found" });
  const hash = await bcrypt.hash(password, 12);
  await execute(pool, "UPDATE users SET password_hash=?, auth_version=auth_version+1 WHERE id=? AND owner_user_id=?", [hash, id, Number(req.user.user_id)]);
  await appendSecurityAudit(pool, req.user.user_id, id, "managed_account_password_reset", req.ip);
  res.json({ ok: true, message: "Password reset" });
}));

router.post(paths("resetPassword"), requireAuth, asyncHandler(async (req, res) => {
  const userId = Number(req.user.user_id || 0);
  const oldPassword = String(req.body?.old_password ?? "");
  const newPassword = String(req.body?.new_password ?? "");
  const confirmPassword = String(req.body?.confirm_password ?? "");
  if (!oldPassword || !newPassword || !confirmPassword) return res.status(400).json({ ok: false, error: "All fields are required" });
  if (newPassword !== confirmPassword) return res.status(400).json({ ok: false, error: "Passwords do not match" });
  const issue = passwordError(newPassword, "New password");
  if (issue) return res.status(400).json({ ok: false, error: issue });
  const user = await first(pool, "SELECT password_hash FROM users WHERE id=? LIMIT 1", [userId]);
  if (!user || !(await bcrypt.compare(oldPassword, user.password_hash))) return res.status(401).json({ ok: false, error: "Old password is incorrect" });
  const hash = await bcrypt.hash(newPassword, 12);
  await execute(pool, "UPDATE users SET password_hash=?, auth_version=auth_version+1 WHERE id=?", [hash, userId]);
  await appendSecurityAudit(pool, userId, userId, "password_changed", req.ip);
  return res.json({ ok: true, message: "Password updated. Please sign in again." });
}));

module.exports = router;
