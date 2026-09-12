const express = require("express");
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");
const { requireAuth, requireOperations } = require("../middleware/auth");
const { asyncHandler, paths, int, trim, execute, first, rows } = require("../lib/helpers");
const { withTransaction } = require("../config/db");
const { callSheinProfileApi, normEmail, remoteBrowserUrl } = require("../lib/shein");
const { seal } = require("../lib/secretBox");

const router = express.Router();
router.use(requireAuth);
const uid = (req) => Number(req.user.user_id);
const isChromeProfileKey = (value) => value === "Default" || /^Profile \d+$/.test(value);

async function nextProfileKey() {
  const existing = await rows(pool, "SELECT profile_key FROM shein_accounts WHERE profile_key IS NOT NULL");
  const reserved = await rows(pool, "SELECT profile_key FROM shein_profile_reservations");
  const used = new Set([...existing, ...reserved].map((row) => trim(row.profile_key).toLowerCase()).filter(Boolean));
  if (!used.has("default")) return "Default";
  for (let index = 1; index <= 10000; index += 1) {
    const candidate = `Profile ${index}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error("No unused SHEIN browser profile is available");
}

async function assignMissingProfiles(userId) {
  const missing = await rows(
    pool,
    "SELECT id FROM shein_accounts WHERE user_id=? AND (profile_key IS NULL OR TRIM(profile_key)='') ORDER BY id ASC",
    [userId],
  );
  for (const account of missing) {
    const profile = await nextProfileKey();
    await execute(pool, "UPDATE shein_accounts SET profile_key=? WHERE id=? AND user_id=?", [profile, account.id, userId]);
  }
}

async function ensureProfileAvailable(profileKey, accountId = 0) {
  if (!isChromeProfileKey(profileKey)) throw new Error("profile_key must be Default or Profile N");
  const existing = await first(
    pool,
    "SELECT id FROM shein_accounts WHERE profile_key=? AND id<>? LIMIT 1",
    [profileKey, accountId],
  );
  if (existing) {
    const error = new Error("This browser profile is already assigned to another SHEIN account");
    error.status = 409;
    throw error;
  }
  const reserved = await first(pool, "SELECT profile_key FROM shein_profile_reservations WHERE profile_key=? LIMIT 1", [profileKey]);
  if (reserved) {
    const error = new Error("This browser profile is reserved because its previous account data is still on disk");
    error.status = 409;
    throw error;
  }
}

async function ensureOwnedProfile(userId, profileKey) {
  if (!isChromeProfileKey(profileKey)) {
    const error = new Error("profile_key must be Default or Profile N");
    error.status = 400;
    throw error;
  }
  const account = await first(pool, "SELECT id,profile_key FROM shein_accounts WHERE user_id=? AND profile_key=? LIMIT 1", [userId, profileKey]);
  if (!account) {
    const error = new Error("No SHEIN account is assigned to this browser profile");
    error.status = 404;
    throw error;
  }
  return account;
}

router.get(paths("getAccounts", true), asyncHandler(async (req, res) => {
  await assignMissingProfiles(uid(req));
  const users = await rows(pool, "SELECT id,api_email AS email,shein_email,gmail_email,profile_key,profile_name,created_at,updated_at, (shein_password_enc IS NOT NULL) AS has_shein_password, (gmail_app_password_enc IS NOT NULL) AS has_gmail_app_password, (storage_state_enc IS NOT NULL) AS has_storage_state FROM shein_accounts WHERE user_id=? ORDER BY id DESC", [uid(req)]);
  let profiles = [];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    const file = path.join(local, "Google", "Chrome", "User Data", "Local State");
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      profiles = Object.entries(data?.profile?.info_cache || {})
        .filter(([key]) => isChromeProfileKey(key))
        .map(([key, info]) => ({ profile_key: key, name: trim(info?.name) || key }));
    } catch (_) { /* Chrome is optional. */ }
  }
  const pythonProfiles = await callSheinProfileApi("list");
  const serverProfiles = Array.isArray(pythonProfiles.data?.profiles) ? pythonProfiles.data.profiles : [];
  const ownedProfileKeys = new Set(users.map((user) => trim(user.profile_key)).filter(Boolean));
  const visibleServerProfiles = serverProfiles.filter((profile) => ownedProfileKeys.has(trim(profile.profile_key)));
  const visibleLocalProfiles = profiles.filter((profile) => ownedProfileKeys.has(trim(profile.profile_key)));
  const merged = new Map();
  for (const profile of visibleServerProfiles) merged.set(profile.profile_key, { ...profile, source: "vps" });
  for (const profile of visibleLocalProfiles) {
    if (!merged.has(profile.profile_key)) merged.set(profile.profile_key, { ...profile, source: "local" });
  }
  for (const user of users) {
    if (user.profile_key) {
      const current = merged.get(user.profile_key) || {};
      const customName = trim(user.profile_name);
      merged.set(user.profile_key, {
        ...current,
        profile_key: user.profile_key,
        name: customName || current.name || user.profile_key,
        profile_name: customName,
        source: current.source || "account",
      });
    }
  }
  res.json({
    ok: true,
    users,
    chrome_profiles: [...merged.values()],
    server_profiles: visibleServerProfiles,
    python_api: pythonProfiles.ok ? "ready" : "unavailable",
    remote_browser_url: remoteBrowserUrl(),
  });
}));

router.get(paths("getAccountDetail", true), requireOperations, asyncHandler(async (req, res) => {
  await assignMissingProfiles(uid(req));
  const id = int(req.query.id);
  const email = normEmail(req.query.email);
  if (id <= 0 && !email) return res.status(400).json({ ok: false, error: "id or email is required" });
  const row = id > 0
    ? await first(pool, "SELECT id,api_email AS email,shein_email,gmail_email,profile_key,profile_name,(shein_password_enc IS NOT NULL) AS has_shein_password,(gmail_app_password_enc IS NOT NULL) AS has_gmail_app_password,(storage_state_enc IS NOT NULL) AS has_storage_state FROM shein_accounts WHERE id=? AND user_id=? LIMIT 1", [id, uid(req)])
    : await first(pool, "SELECT id,api_email AS email,shein_email,gmail_email,profile_key,profile_name,(shein_password_enc IS NOT NULL) AS has_shein_password,(gmail_app_password_enc IS NOT NULL) AS has_gmail_app_password,(storage_state_enc IS NOT NULL) AS has_storage_state FROM shein_accounts WHERE api_email=? AND user_id=? LIMIT 1", [email, uid(req)]);
  if (!row) return res.status(404).json({ ok: false, error: "Account not found" });
  res.json({ ok: true, user: row });
}));

router.post(paths("saveAccount", true), requireOperations, asyncHandler(async (req, res) => {
  const d = req.body || {};
  const api = normEmail(d.email), shein = normEmail(d.shein_email || d.email), gmail = normEmail(d.gmail_email || d.shein_email || d.email);
  const password = String(d.shein_password || "");
  const appPassword = String(d.gmail_app_password || "").replace(/ /g, "");
  const cookies = d.cookies_json == null ? "" : String(d.cookies_json);
  let profile = d.profile_key == null ? "" : trim(d.profile_key);
  const profileName = trim(d.profile_name);
  const id = int(d.id);
  if (!api || !shein) return res.status(400).json({ ok: false, error: "API and SHEIN emails are required" });
  try {
    if (id > 0) {
      const existing = await first(pool, "SELECT id,profile_key FROM shein_accounts WHERE id=? AND user_id=? LIMIT 1", [id, uid(req)]);
      if (!existing) return res.status(404).json({ ok: false, error: "Account not found" });
      if (!profile || profile.toLowerCase() === "auto") profile = trim(existing.profile_key) || await nextProfileKey();
      if (profile !== trim(existing.profile_key)) await ensureProfileAvailable(profile, id);
      const fields = [api, shein, gmail, profile, profileName];
      let sql = "UPDATE shein_accounts SET api_email=?,shein_email=?,gmail_email=?,profile_key=?,profile_name=?";
      if (password) { sql += ",shein_password_enc=?"; fields.push(seal(password)); }
      if (appPassword) { sql += ",gmail_app_password_enc=?"; fields.push(seal(appPassword)); }
      if (cookies) { sql += ",storage_state_enc=?"; fields.push(seal(cookies)); }
      sql += " WHERE id=? AND user_id=?";
      fields.push(id, uid(req));
      await execute(pool, sql, fields);
      return res.json({ ok: true, message: "Updated" });
    }
    const existingByEmail = await first(pool, "SELECT id,profile_key FROM shein_accounts WHERE user_id=? AND api_email=? LIMIT 1", [uid(req), api]);
    if ((!profile || profile.toLowerCase() === "auto") && existingByEmail?.profile_key) profile = trim(existingByEmail.profile_key);
    if (!profile || profile.toLowerCase() === "auto") profile = await nextProfileKey();
    await ensureProfileAvailable(profile, existingByEmail?.id || 0);
    await execute(pool, "INSERT INTO shein_accounts (user_id,api_email,shein_email,gmail_email,profile_key,profile_name,shein_password_enc,gmail_app_password_enc,storage_state_enc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE shein_email=VALUES(shein_email),gmail_email=VALUES(gmail_email),profile_key=VALUES(profile_key),profile_name=VALUES(profile_name),shein_password_enc=VALUES(shein_password_enc),gmail_app_password_enc=VALUES(gmail_app_password_enc),storage_state_enc=VALUES(storage_state_enc)", [uid(req), api, shein, gmail, profile, profileName, seal(password), seal(appPassword), cookies ? seal(cookies) : null]);
    res.status(201).json({ ok: true, message: "Saved", profile_key: profile });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "Account already exists" });
    throw e;
  }
}));

function sendPythonProfileError(res, result) {
  const status = Number(result.status) >= 400 ? Number(result.status) : 503;
  return res.status(status).json({
    ok: false,
    error: result.error || "Python profile service unavailable",
    code: result.code || "PYTHON_PROFILE_API_ERROR",
    login_required: Boolean(result.login_required),
    profile_key: result.profile_key,
  });
}

router.post(paths("profileLoginStart"), requireOperations, asyncHandler(async (req, res) => {
  const profileKey = trim(req.body?.profile_key);
  await ensureOwnedProfile(uid(req), profileKey);
  const result = await callSheinProfileApi("login_start", { profile_key: profileKey });
  if (!result.ok) return sendPythonProfileError(res, result);
  res.json({
    ok: true,
    login: result.data?.login,
    remote_browser_url: remoteBrowserUrl(),
    message: "Open the VPS browser, finish SHEIN login, then check the profile status.",
  });
}));

router.get(paths("profileLoginStatus"), requireOperations, asyncHandler(async (req, res) => {
  const profileKey = trim(req.query.profile_key);
  const sessionId = trim(req.query.session_id);
  await ensureOwnedProfile(uid(req), profileKey);
  if (!sessionId) return res.status(400).json({ ok: false, error: "session_id is required" });
  const result = await callSheinProfileApi("login_status", { session_id: sessionId });
  if (!result.ok) return sendPythonProfileError(res, result);
  const login = result.data?.login;
  if (login?.profile_key && login.profile_key !== profileKey) return res.status(403).json({ ok: false, error: "Profile session mismatch" });
  res.json({ ok: true, login });
}));

router.post(paths("profileLoginFinish"), requireOperations, asyncHandler(async (req, res) => {
  const profileKey = trim(req.body?.profile_key || req.query?.profile_key);
  const sessionId = trim(req.body?.session_id || req.query?.session_id);
  await ensureOwnedProfile(uid(req), profileKey);
  if (!sessionId) return res.status(400).json({ ok: false, error: "session_id is required" });
  const result = await callSheinProfileApi("login_finish", { session_id: sessionId, profile_key: profileKey });
  if (!result.ok) return sendPythonProfileError(res, result);
  const login = result.data?.login;
  if (login?.profile_key && login.profile_key !== profileKey) return res.status(403).json({ ok: false, error: "Profile session mismatch" });
  res.json({ ok: true, login, message: "Profile login session closed." });
}));

router.all(paths("profileLoginCancel"), requireOperations, asyncHandler(async (req, res) => {
  if (req.method !== "DELETE" && req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const profileKey = trim(req.body?.profile_key || req.query?.profile_key);
  const sessionId = trim(req.body?.session_id || req.query?.session_id);
  await ensureOwnedProfile(uid(req), profileKey);
  if (!sessionId) return res.status(400).json({ ok: false, error: "session_id is required" });
  const result = await callSheinProfileApi("login_cancel", { session_id: sessionId });
  if (!result.ok) return sendPythonProfileError(res, result);
  res.json({ ok: true, login: result.data?.login, message: "Profile login session cancelled." });
}));

router.post(paths("deleteAccount", true), requireOperations, asyncHandler(async (req, res) => {
  const id = int(req.body?.id);
  const email = normEmail(req.body?.email);
  if (id <= 0 && !email) return res.status(400).json({ ok: false, error: "id or email is required" });
  const deleted = await withTransaction(async (db) => {
    const account = id > 0
      ? await first(db, "SELECT id,profile_key,api_email FROM shein_accounts WHERE id=? AND user_id=? LIMIT 1 FOR UPDATE", [id, uid(req)])
      : await first(db, "SELECT id,profile_key,api_email FROM shein_accounts WHERE api_email=? AND user_id=? LIMIT 1 FOR UPDATE", [email, uid(req)]);
    if (!account) return 0;
    const result = await execute(db, "DELETE FROM shein_accounts WHERE id=? AND user_id=?", [account.id, uid(req)]);
    if (result.affectedRows && trim(account.profile_key)) {
      await execute(db, "INSERT IGNORE INTO shein_profile_reservations (profile_key,user_id,account_email) VALUES (?,?,?)", [trim(account.profile_key), uid(req), account.api_email]);
    }
    return Number(result.affectedRows || 0);
  });
  res.json({ ok: true, deleted });
}));

module.exports = router;
