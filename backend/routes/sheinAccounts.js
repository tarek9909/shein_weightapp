const express = require("express");
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");
const { requireAuth, requireOperations } = require("../middleware/auth");
const { asyncHandler, paths, int, trim, execute, first, rows } = require("../lib/helpers");
const { normEmail } = require("../lib/shein");
const { seal } = require("../lib/secretBox");

const router = express.Router();
router.use(requireAuth, requireOperations);
const uid = (req) => Number(req.user.user_id);

router.get(paths("getAccounts", true), asyncHandler(async (req, res) => {
  const users = await rows(pool, "SELECT id,api_email AS email,shein_email,gmail_email,profile_key,created_at,updated_at, (shein_password_enc IS NOT NULL) AS has_shein_password, (gmail_app_password_enc IS NOT NULL) AS has_gmail_app_password, (storage_state_enc IS NOT NULL) AS has_storage_state FROM shein_accounts WHERE user_id=? ORDER BY id DESC", [uid(req)]);
  let profiles = [];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    const file = path.join(local, "Google", "Chrome", "User Data", "Local State");
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      profiles = Object.entries(data?.profile?.info_cache || {}).map(([key, info]) => ({ profile_key: key, name: trim(info?.name) || key, account_name: trim(info?.gaia_name), email: trim(info?.user_name) }));
    } catch (_) { /* Chrome is optional. */ }
  }
  res.json({ ok: true, users, chrome_profiles: profiles });
}));

router.get(paths("getAccountDetail", true), asyncHandler(async (req, res) => {
  const id = int(req.query.id);
  const email = normEmail(req.query.email);
  if (id <= 0 && !email) return res.status(400).json({ ok: false, error: "id or email is required" });
  const row = id > 0
    ? await first(pool, "SELECT id,api_email AS email,shein_email,gmail_email,profile_key,(shein_password_enc IS NOT NULL) AS has_shein_password,(gmail_app_password_enc IS NOT NULL) AS has_gmail_app_password,(storage_state_enc IS NOT NULL) AS has_storage_state FROM shein_accounts WHERE id=? AND user_id=? LIMIT 1", [id, uid(req)])
    : await first(pool, "SELECT id,api_email AS email,shein_email,gmail_email,profile_key,(shein_password_enc IS NOT NULL) AS has_shein_password,(gmail_app_password_enc IS NOT NULL) AS has_gmail_app_password,(storage_state_enc IS NOT NULL) AS has_storage_state FROM shein_accounts WHERE api_email=? AND user_id=? LIMIT 1", [email, uid(req)]);
  if (!row) return res.status(404).json({ ok: false, error: "Account not found" });
  res.json({ ok: true, user: row });
}));

router.post(paths("saveAccount", true), asyncHandler(async (req, res) => {
  const d = req.body || {};
  const api = normEmail(d.email), shein = normEmail(d.shein_email), gmail = normEmail(d.gmail_email);
  const password = String(d.shein_password || "");
  const appPassword = String(d.gmail_app_password || "").replace(/ /g, "");
  const cookies = d.cookies_json == null ? "" : String(d.cookies_json);
  const profile = d.profile_key == null ? null : trim(d.profile_key);
  const id = int(d.id);
  if (!api || !shein || !gmail) return res.status(400).json({ ok: false, error: "API, SHEIN, and Gmail emails are required" });
  if (id <= 0 && (!password || !appPassword)) return res.status(400).json({ ok: false, error: "Passwords are required for a new account" });
  try {
    if (id > 0) {
      const existing = await first(pool, "SELECT id FROM shein_accounts WHERE id=? AND user_id=? LIMIT 1", [id, uid(req)]);
      if (!existing) return res.status(404).json({ ok: false, error: "Account not found" });
      const fields = [api, shein, gmail, profile];
      let sql = "UPDATE shein_accounts SET api_email=?,shein_email=?,gmail_email=?,profile_key=?";
      if (password) { sql += ",shein_password_enc=?"; fields.push(seal(password)); }
      if (appPassword) { sql += ",gmail_app_password_enc=?"; fields.push(seal(appPassword)); }
      if (cookies) { sql += ",storage_state_enc=?"; fields.push(seal(cookies)); }
      sql += " WHERE id=? AND user_id=?";
      fields.push(id, uid(req));
      await execute(pool, sql, fields);
      return res.json({ ok: true, message: "Updated" });
    }
    await execute(pool, "INSERT INTO shein_accounts (user_id,api_email,shein_email,gmail_email,profile_key,shein_password_enc,gmail_app_password_enc,storage_state_enc) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE shein_email=VALUES(shein_email),gmail_email=VALUES(gmail_email),profile_key=VALUES(profile_key),shein_password_enc=VALUES(shein_password_enc),gmail_app_password_enc=VALUES(gmail_app_password_enc),storage_state_enc=VALUES(storage_state_enc)", [uid(req), api, shein, gmail, profile, seal(password), seal(appPassword), cookies ? seal(cookies) : null]);
    res.status(201).json({ ok: true, message: "Saved" });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "Account already exists" });
    throw e;
  }
}));

router.post(paths("deleteAccount", true), asyncHandler(async (req, res) => {
  const id = int(req.body?.id);
  const email = normEmail(req.body?.email);
  if (id <= 0 && !email) return res.status(400).json({ ok: false, error: "id or email is required" });
  const result = id > 0 ? await execute(pool, "DELETE FROM shein_accounts WHERE id=? AND user_id=?", [id, uid(req)]) : await execute(pool, "DELETE FROM shein_accounts WHERE api_email=? AND user_id=?", [email, uid(req)]);
  res.json({ ok: true, deleted: result.affectedRows });
}));

module.exports = router;
