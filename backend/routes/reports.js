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
  const report = await rows(pool, `SELECT m.id, m.name,
    (SELECT COALESCE(SUM(CAST(o.order_details AS DECIMAL(10,2))),0) FROM orders o WHERE o.user_id=m.user_id AND o.month_id=m.id) AS orders_cost,
    (SELECT COALESCE(SUM(o.amount_to_collect),0) FROM orders o WHERE o.user_id=m.user_id AND o.month_id=m.id) AS orders_to_collect,
    (SELECT COALESCE(SUM(b.value),0) FROM budget b WHERE b.user_id=m.user_id AND b.month_id=m.id) AS budget_total,
    (SELECT COALESCE(SUM(p.payment_amount),0) FROM payments p WHERE p.user_id=m.user_id AND p.month_id=m.id) AS payments_total,
    (SELECT COALESCE(SUM(c.customs_fee),0) FROM customs c WHERE c.user_id=m.user_id AND c.month_id=m.id) AS customs_total,
    (SELECT COALESCE(SUM(l.amount),0) FROM delivery_losses l WHERE l.user_id=m.user_id AND l.month_id=m.id AND l.reversed_at IS NULL) AS losses_total,
    (SELECT COALESCE(SUM(oc.shein_total_weight_plus_2kg),0) FROM order_carts oc JOIN orders o ON o.id=oc.order_id WHERE o.user_id=m.user_id AND o.month_id=m.id) AS estimated_weight,
    (SELECT COALESCE(s.kg_price, 0) FROM user_settings s WHERE s.user_id=m.user_id LIMIT 1) AS kg_price,
    (SELECT COUNT(*) FROM orders o2 WHERE o2.user_id=m.user_id AND o2.month_id=m.id) AS order_count
    FROM month m ${where} ORDER BY m.id DESC`, params);
  const reportsList = report.map((row) => {
    const ordersCost = Number(row.orders_cost || 0);
    const ordersToCollect = Number(row.orders_to_collect || 0);
    const budgetTotal = Number(row.budget_total || 0);
    const paymentsTotal = Number(row.payments_total || 0);
    const customsTotal = Number(row.customs_total || 0);
    const lossesTotal = Number(row.losses_total || 0);
    const estimatedWeight = Number(row.estimated_weight || 0);
    const kgPrice = Number(row.kg_price || 0);
    const orderCount = Number(row.order_count || 0);
    const estimatedShipping = Math.round((estimatedWeight * kgPrice + Number.EPSILON) * 100) / 100;
    const estimatedProfit = Math.round((ordersToCollect - ordersCost - estimatedShipping + Number.EPSILON) * 100) / 100;
    const estimatedProfitAfterLosses = Math.round((estimatedProfit - lossesTotal + Number.EPSILON) * 100) / 100;
    const netProfit = Math.round((paymentsTotal - ordersCost - customsTotal - lossesTotal + Number.EPSILON) * 100) / 100;
    const projectedProfit = Math.round((ordersToCollect - ordersCost - customsTotal - lossesTotal + Number.EPSILON) * 100) / 100;
    return {
      id: Number(row.id),
      name: row.name,
      orders_cost: ordersCost,
      orders_to_collect: ordersToCollect,
      budget_total: budgetTotal,
      payments_total: paymentsTotal,
      customs_total: customsTotal,
      losses_total: lossesTotal,
      estimated_weight: estimatedWeight,
      kg_price: kgPrice,
      estimated_shipping: estimatedShipping,
      estimated_profit: estimatedProfit,
      estimated_profit_after_losses: estimatedProfitAfterLosses,
      order_count: orderCount,
      net_profit: netProfit,
      projected_profit: projectedProfit,
    };
  });
  const totals = {
    orders_cost: reportsList.reduce((s, r) => s + r.orders_cost, 0),
    orders_to_collect: reportsList.reduce((s, r) => s + r.orders_to_collect, 0),
    budget_total: reportsList.reduce((s, r) => s + r.budget_total, 0),
    payments_total: reportsList.reduce((s, r) => s + r.payments_total, 0),
    customs_total: reportsList.reduce((s, r) => s + r.customs_total, 0),
    losses_total: reportsList.reduce((s, r) => s + r.losses_total, 0),
    estimated_profit: reportsList.reduce((s, r) => s + r.estimated_profit, 0),
    estimated_profit_after_losses: reportsList.reduce((s, r) => s + r.estimated_profit_after_losses, 0),
    net_profit: reportsList.reduce((s, r) => s + r.net_profit, 0),
    projected_profit: reportsList.reduce((s, r) => s + r.projected_profit, 0),
    order_count: reportsList.reduce((s, r) => s + r.order_count, 0),
  };
  res.json({ ok: true, reports: reportsList, totals });
}));

module.exports = router;
