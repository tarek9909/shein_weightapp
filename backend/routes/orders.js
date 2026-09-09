const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, paths, int, number, trim, execute, rows, first } = require("../lib/helpers");

const router = express.Router();
router.use(requireAuth);
const userId = (req) => Number(req.user.user_id);

router.get(paths("getOrders", true), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id);
  if (monthId <= 0) return res.status(400).json({ success: false, error: "month_id is required" });
  if (!(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId(req)]))) return res.status(403).json({ success: false, error: "Invalid month for this user" });
  res.json(await rows(pool, `SELECT o.id, o.month_id, o.order_name, o.order_details, o.amount_to_collect,
    COALESCE(SUM(COALESCE(oc.shein_total_weight_kg,0)),0) AS shein_total_weight_kg_sum,
    COALESCE(SUM(COALESCE(oc.shein_total_weight_plus_2kg,0)),0) AS shein_total_weight_plus_2kg_sum,
    SUM(CASE WHEN COALESCE(oc.is_joint_shipment,0)=1 THEN 1 ELSE 0 END) AS joint_shipment_carts,
    SUM(CASE WHEN COALESCE(oc.shein_delivered,0)=0 AND oc.shein_order_no IS NOT NULL AND TRIM(oc.shein_order_no)<>'' THEN 1 ELSE 0 END) AS shein_undelivered_carts
    FROM orders o LEFT JOIN order_carts oc ON oc.order_id=o.id AND oc.user_id=o.user_id
    WHERE o.month_id=? AND o.user_id=?
    GROUP BY o.id,o.month_id,o.order_name,o.order_details,o.amount_to_collect ORDER BY o.id DESC`, [monthId, userId(req)]));
}));

router.post(paths("addOrder"), asyncHandler(async (req, res) => {
  const monthId = int(req.body?.month_id); const name = req.body?.order_name == null ? null : trim(req.body.order_name);
  const details = req.body?.order_details == null ? "" : String(req.body.order_details);
  const amount = number(req.body?.amount_to_collect, 0);
  if (monthId <= 0 || details === "") return res.status(400).json({ success: false, error: "month_id and order_details are required" });
  if (amount < 0) return res.status(400).json({ success: false, error: "amount_to_collect must be >= 0" });
  if (!(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId(req)]))) return res.status(403).json({ success: false, error: "Invalid month for this user" });
  const result = await execute(pool, "INSERT INTO orders (month_id, order_name, order_details, amount_to_collect, user_id) VALUES (?, ?, ?, ?, ?)", [monthId, name, details, amount, userId(req)]);
  res.json({ success: true, id: Number(result.insertId) });
}));

router.post(paths("updateOrder"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const name = req.body?.order_name == null ? null : trim(req.body.order_name);
  const details = req.body?.order_details == null ? "" : String(req.body.order_details); const amount = number(req.body?.amount_to_collect, 0);
  if (id <= 0 || details === "") return res.status(400).json({ success: false, error: "id and order_details are required" });
  if (amount < 0) return res.status(400).json({ success: false, error: "amount_to_collect must be >= 0" });
  const result = await execute(pool, "UPDATE orders SET order_name=?, order_details=?, amount_to_collect=? WHERE id=? AND user_id=?", [name, details, amount, id, userId(req)]);
  res.json({ success: true, affected: result.affectedRows });
}));

router.post(paths("deleteOrder"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); if (id <= 0) return res.status(400).json({ success: false, error: "id is required" });
  const result = await execute(pool, "DELETE FROM orders WHERE id=? AND user_id=?", [id, userId(req)]);
  res.json({ success: true, affected: result.affectedRows });
}));

module.exports = router;
