const express = require("express");
const { pool } = require("../config/db");
const { requireAuth, requireWriteAccess } = require("../middleware/auth");
const { asyncHandler, paths, int, trim, execute, rows } = require("../lib/helpers");

const router = express.Router();
router.use(requireAuth, requireWriteAccess);

router.get(paths("getMonths", true), asyncHandler(async (req, res) => {
  res.json(await rows(pool, "SELECT id, name FROM month WHERE user_id=? ORDER BY id DESC", [Number(req.user.user_id)]));
}));

router.post(paths("addMonth"), asyncHandler(async (req, res) => {
  const name = trim(req.body?.name);
  if (!name) return res.status(400).json({ success: false, error: "name is required" });
  const result = await execute(pool, "INSERT INTO month (name, user_id) VALUES (?, ?)", [name, Number(req.user.user_id)]);
  res.json({ success: true, id: Number(result.insertId) });
}));

router.post(paths("updateMonth"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const name = trim(req.body?.name);
  if (id <= 0 || !name) return res.status(400).json({ success: false, error: "id and name are required" });
  const result = await execute(pool, "UPDATE month SET name=? WHERE id=? AND user_id=?", [name, id, Number(req.user.user_id)]);
  res.json({ success: true, affected: result.affectedRows });
}));

router.post(paths("deleteMonth"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id);
  if (id <= 0) return res.status(400).json({ success: false, error: "id is required" });
  const result = await execute(pool, "DELETE FROM month WHERE id=? AND user_id=?", [id, Number(req.user.user_id)]);
  res.json({ success: true, affected: result.affectedRows });
}));

module.exports = router;
