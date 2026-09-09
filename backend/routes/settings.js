const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, paths, int, number, finite, trim, execute, rows, first } = require("../lib/helpers");
const router = express.Router(); router.use(requireAuth);
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
  const id = int(req.body?.id); const label = trim(req.body?.label); const amount = Number(req.body?.adjustment_amount); const active = req.body && Object.prototype.hasOwnProperty.call(req.body, "active") ? (req.body.active ? 1 : 0) : 1; const sortOrder = int(req.body?.sort_order);
  if (id <= 0 || !label || label.length > 32 || !Number.isFinite(amount)) return res.status(400).json({ ok: false, error: "id, label, and a finite adjustment_amount are required" });
  try { const result = await execute(pool, "UPDATE delivery_charge_presets SET label=?, adjustment_amount=?, active=?, sort_order=? WHERE id=? AND user_id=?", [label, amount, active, sortOrder, id, uid(req)]); res.json({ ok: true, affected: result.affectedRows }); }
  catch (e) { if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "A preset with this label already exists" }); throw e; }
}));
router.post(paths("deleteDeliveryChargePreset"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); if (id <= 0) return res.status(400).json({ ok: false, error: "id is required" });
  const result = await execute(pool, "UPDATE delivery_charge_presets SET active=0 WHERE id=? AND user_id=?", [id, uid(req)]); res.json({ ok: true, affected: result.affectedRows });
}));
module.exports = router;
