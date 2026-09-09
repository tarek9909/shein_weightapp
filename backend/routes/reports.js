const express = require("express");
const { pool } = require("../config/db");
const { requireAuth, requireOperations } = require("../middleware/auth");
const { asyncHandler, paths, int, first, rows } = require("../lib/helpers");

const router = express.Router();
router.use(requireAuth, requireOperations);

router.get(paths("summary", true), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id);
  const userId = Number(req.user.user_id);
  if (monthId > 0 && !(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId]))) return res.status(404).json({ ok: false, error: "Month not found" });
  const where = monthId > 0 ? "WHERE m.user_id=? AND m.id=?" : "WHERE m.user_id=?";
  const params = monthId > 0 ? [userId, monthId] : [userId];
  const report = await rows(pool, `SELECT m.id,m.name,
    (SELECT COALESCE(SUM(o.amount_to_collect),0) FROM orders o WHERE o.user_id=m.user_id AND o.month_id=m.id) AS orders_to_collect,
    (SELECT COALESCE(SUM(p.payment_amount),0) FROM payments p WHERE p.user_id=m.user_id AND p.month_id=m.id) AS payments_total,
    (SELECT COALESCE(SUM(c.customs_fee),0) FROM customs c WHERE c.user_id=m.user_id AND c.month_id=m.id) AS customs_total,
    (SELECT COALESCE(SUM(l.amount),0) FROM delivery_losses l WHERE l.user_id=m.user_id AND l.month_id=m.id AND l.reversed_at IS NULL) AS losses_total,
    (SELECT COUNT(*) FROM orders o2 WHERE o2.user_id=m.user_id AND o2.month_id=m.id) AS order_count
    FROM month m ${where} ORDER BY m.id DESC`, params);
  res.json({ ok: true, reports: report.map((row) => ({
    id: Number(row.id), name: row.name,
    orders_to_collect: Number(row.orders_to_collect || 0), payments_total: Number(row.payments_total || 0),
    customs_total: Number(row.customs_total || 0), losses_total: Number(row.losses_total || 0), order_count: Number(row.order_count || 0),
  })) });
}));

module.exports = router;
