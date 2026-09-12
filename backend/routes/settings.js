const express = require("express");
const { pool } = require("../config/db");
const { requireAuth, requireAdmin, requireWriteAccess } = require("../middleware/auth");
const { asyncHandler, paths, int, number, finite, trim, execute, rows, first } = require("../lib/helpers");
const { callSheinRemoteBrowserApi } = require("../lib/shein");
const { appendSecurityAudit } = require("../lib/activity");
const router = express.Router(); router.use(requireAuth, requireWriteAccess);
const uid = (req) => Number(req.user.user_id);

router.get(paths("getKgPrice", true), asyncHandler(async (req, res) => {
  const row = await first(pool, "SELECT kg_price FROM user_settings WHERE user_id=? LIMIT 1", [uid(req)]);
  res.json({ success: true, kg_price: row ? Number(row.kg_price) : 0 });
}));
router.post(paths("saveKgPrice"), asyncHandler(async (req, res) => {
  const price = number(req.body?.kg_price); if (!finite(req.body?.kg_price) || price < 0) return res.status(400).json({ success: false, error: "kg_price must be >= 0" });
  await execute(pool, "INSERT INTO user_settings (user_id, kg_price) VALUES (?, ?) ON DUPLICATE KEY UPDATE kg_price=VALUES(kg_price)", [uid(req), price]);
  res.json({ success: true, kg_price: price });
}));
router.get(paths("getVncCredentials"), requireAdmin, asyncHandler(async (_req, res) => {
  const result = await callSheinRemoteBrowserApi("get_vnc_credentials");
  if (!result.ok) return res.status(result.status || 503).json({ ok: false, error: result.error });
  res.json({ ok: true, username: result.data?.username || "admin" });
}));
router.post(paths("updateVncCredentials"), requireAdmin, asyncHandler(async (req, res) => {
  const username = trim(req.body?.username);
  const password = String(req.body?.password || "");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(username)) return res.status(400).json({ ok: false, error: "VNC username must use only letters, numbers, dot, underscore, or hyphen" });
  if (password.length < 8 || /[\r\n]/.test(password)) return res.status(400).json({ ok: false, error: "VNC password must be at least 8 characters and cannot contain line breaks" });
  const result = await callSheinRemoteBrowserApi("update_vnc_credentials", { username, password });
  if (!result.ok) return res.status(result.status || 503).json({ ok: false, error: result.error });
  await appendSecurityAudit(pool, req.user.user_id, req.user.user_id, "vnc_credentials_updated", req.ip, { username });
  res.json({ ok: true, username: result.data?.username || username });
}));
router.get(paths("getDeliveryChargePresets"), asyncHandler(async (req, res) => {
  const data = await rows(pool, "SELECT id, label, adjustment_amount, active, sort_order FROM delivery_charge_presets WHERE user_id=? ORDER BY sort_order ASC, id ASC", [uid(req)]);
  res.json({ ok: true, presets: data.map((r) => ({ ...r, id: Number(r.id), adjustment_amount: Number(r.adjustment_amount), active: Boolean(r.active), sort_order: Number(r.sort_order) })) });
}));
router.post(paths("addDeliveryChargePreset"), asyncHandler(async (req, res) => {
  const label = trim(req.body?.label); const amount = Number(req.body?.adjustment_amount); const sortOrder = int(req.body?.sort_order);
  if (!label || label.length > 32 || !Number.isFinite(amount)) return res.status(400).json({ ok: false, error: "label and a finite adjustment_amount are required" });
  try { const result = await execute(pool, "INSERT INTO delivery_charge_presets (user_id,label,adjustment_amount,active,sort_order) VALUES (?, ?, ?, 1, ?)", [uid(req), label, amount, sortOrder]); res.json({ ok: true, id: Number(result.insertId) }); }
  catch (e) { if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "A preset with this label already exists" }); throw e; }
}));
router.post(paths("updateDeliveryChargePreset"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const label = trim(req.body?.label); const amount = Number(req.body?.adjustment_amount); const rawActive = req.body?.active; if (req.body && Object.prototype.hasOwnProperty.call(req.body, "active") && ![true, false, 0, 1, "0", "1", "true", "false"].includes(rawActive)) return res.status(400).json({ ok: false, error: "active must be a boolean" }); const active = req.body && Object.prototype.hasOwnProperty.call(req.body, "active") ? (rawActive === true || rawActive === 1 || rawActive === "1" || rawActive === "true" ? 1 : 0) : 1; const sortOrder = int(req.body?.sort_order);
  if (id <= 0 || !label || label.length > 32 || !Number.isFinite(amount)) return res.status(400).json({ ok: false, error: "id, label, and a finite adjustment_amount are required" });
  try { const result = await execute(pool, "UPDATE delivery_charge_presets SET label=?, adjustment_amount=?, active=?, sort_order=? WHERE id=? AND user_id=?", [label, amount, active, sortOrder, id, uid(req)]); res.json({ ok: true, affected: result.affectedRows }); }
  catch (e) { if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "A preset with this label already exists" }); throw e; }
}));
router.post(paths("deleteDeliveryChargePreset"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); if (id <= 0) return res.status(400).json({ ok: false, error: "id is required" });
  const result = await execute(pool, "UPDATE delivery_charge_presets SET active=0 WHERE id=? AND user_id=?", [id, uid(req)]); res.json({ ok: true, affected: result.affectedRows });
}));
module.exports = router;
