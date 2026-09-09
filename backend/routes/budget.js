const express = require("express");
const { pool } = require("../config/db");
const { requireAuth, requireWriteAccess } = require("../middleware/auth");
const { asyncHandler, paths, int, number, execute, rows, first } = require("../lib/helpers");

const router = express.Router(); router.use(requireAuth, requireWriteAccess);
const uid = (req) => Number(req.user.user_id);
const ensureMonth = async (res, monthId, userId) => {
  if (!(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId]))) {
    res.status(403).json({ success: false, error: "Invalid month for this user" }); return false;
  } return true;
};
router.get(paths("getBudget", true), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id); if (monthId <= 0) return res.status(400).json({ success: false, error: "month_id is required" });
  if (!(await ensureMonth(res, monthId, uid(req)))) return;
  res.json(await rows(pool, "SELECT id, month_id, value, description FROM budget WHERE month_id=? AND user_id=? ORDER BY id DESC", [monthId, uid(req)]));
}));
router.post(paths("addBudget"), asyncHandler(async (req, res) => {
  const monthId = int(req.body?.month_id); const value = number(req.body?.value); if (monthId <= 0) return res.status(400).json({ success: false, error: "month_id is required" });
  if (!Number.isFinite(value) || value < 0) return res.status(400).json({ success: false, error: "value must be a finite number >= 0" });
  if (!(await ensureMonth(res, monthId, uid(req)))) return;
  const result = await execute(pool, "INSERT INTO budget (month_id, value, description, user_id) VALUES (?, ?, ?, ?)", [monthId, value, req.body?.description ?? null, uid(req)]);
  res.json({ success: true, id: Number(result.insertId) });
}));
router.post(paths("updateBudget"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const value = number(req.body?.value); if (id <= 0) return res.status(400).json({ success: false, error: "id is required" });
  if (!Number.isFinite(value) || value < 0) return res.status(400).json({ success: false, error: "value must be a finite number >= 0" });
  const result = await execute(pool, "UPDATE budget SET value=?, description=? WHERE id=? AND user_id=?", [value, req.body?.description ?? null, id, uid(req)]);
  res.json({ success: true, affected: result.affectedRows });
}));
router.post(paths("deleteBudget"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); if (id <= 0) return res.status(400).json({ success: false, error: "id is required" });
  const result = await execute(pool, "DELETE FROM budget WHERE id=? AND user_id=?", [id, uid(req)]);
  res.json({ success: true, affected: result.affectedRows });
}));
module.exports = router;
