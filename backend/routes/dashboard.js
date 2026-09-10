const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, paths, int, first, rows } = require("../lib/helpers");

const router = express.Router();
router.use(requireAuth);
const uid = (req) => Number(req.user.user_id);

router.get(paths("getSummary", true), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id);
  if (monthId <= 0) return res.status(400).json({ ok: false, error: "month_id is required" });

  const month = await first(pool, "SELECT id, name FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, uid(req)]);
  if (!month) return res.status(403).json({ ok: false, error: "Invalid month for this user" });

  const userId = uid(req);

  // 1. Budget metrics
  const budgetRow = await first(
    pool,
    "SELECT COUNT(*) AS count, COALESCE(SUM(value), 0) AS total FROM budget WHERE user_id=? AND month_id=?",
    [userId, monthId]
  );
  const budgetTotal = Number(budgetRow?.total || 0);
  const budgetCount = Number(budgetRow?.count || 0);

  // 2. User settings (KG Price)
  const settingsRow = await first(pool, "SELECT kg_price FROM user_settings WHERE user_id=? LIMIT 1", [userId]);
  const kgPrice = Number(settingsRow?.kg_price || 0);

  // 3. Payment metrics
  const paymentRow = await first(
    pool,
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(payment_amount), 0) AS total,
            COALESCE(SUM(CASE WHEN COALESCE(payment_type, 'manual')='customers' THEN payment_amount ELSE 0 END), 0) AS customer_payments_total,
            COALESCE(SUM(CASE WHEN COALESCE(payment_type, 'manual')='manual' THEN payment_amount ELSE 0 END), 0) AS manual_payments_total
     FROM payments WHERE user_id=? AND month_id=?`,
    [userId, monthId]
  );
  const paymentsTotal = Number(paymentRow?.total || 0);
  const paymentCount = Number(paymentRow?.count || 0);
  const customerPaymentsTotal = Number(paymentRow?.customer_payments_total || 0);
  const manualPaymentsTotal = Number(paymentRow?.manual_payments_total || 0);

  // 4. Customs & Freight metrics
  const customsRow = await first(
    pool,
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(customs_fee), 0) AS total,
            COALESCE(SUM(weight_kg), 0) AS weight_total
     FROM customs WHERE user_id=? AND month_id=?`,
    [userId, monthId]
  );
  const customsTotal = Number(customsRow?.total || 0);
  const customsCount = Number(customsRow?.count || 0);
  const actualWeightTotal = Number(customsRow?.weight_total || 0);

  // 5. Confirmed Delivery Losses
  const lossRow = await first(
    pool,
    "SELECT COALESCE(SUM(amount), 0) AS total FROM delivery_losses WHERE user_id=? AND month_id=? AND status='confirmed' AND reversed_at IS NULL",
    [userId, monthId]
  );
  const lossTotal = Number(lossRow?.total || 0);

  // 6. Orders metrics & Estimated Weight
  const orderRow = await first(
    pool,
    `SELECT COUNT(*) AS count,
            COALESCE(SUM(CAST(order_details AS DECIMAL(10,2))), 0) AS cost_total,
            COALESCE(SUM(amount_to_collect), 0) AS collect_total
     FROM orders WHERE user_id=? AND month_id=?`,
    [userId, monthId]
  );
  const orderCostTotal = Number(orderRow?.cost_total || 0);
  const orderCollectTotal = Number(orderRow?.collect_total || 0);
  const orderCount = Number(orderRow?.count || 0);

  const cartWeightRow = await first(
    pool,
    `SELECT COALESCE(SUM(oc.shein_total_weight_plus_2kg), 0) AS estimated_weight,
            COUNT(oc.id) AS total_carts,
            SUM(CASE WHEN (oc.shein_tracking_no IS NOT NULL AND TRIM(oc.shein_tracking_no) <> '')
                          OR (oc.shein_split_tracking_numbers_json IS NOT NULL AND TRIM(oc.shein_split_tracking_numbers_json) <> '')
                     THEN 1 ELSE 0 END) AS tracked_carts
     FROM order_carts oc
     JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
     WHERE oc.user_id=? AND o.month_id=?`,
    [userId, monthId]
  );
  const estimatedWeightTotal = Number(cartWeightRow?.estimated_weight || 0);
  const totalCartsCount = Number(cartWeightRow?.total_carts || 0);
  const trackedCartsCount = Number(cartWeightRow?.tracked_carts || 0);

  // 7. Customer & Delivery Pipeline metrics
  const cRow = await first(
    pool,
    `SELECT COUNT(*) AS customer_count,
            SUM(received_at IS NOT NULL) AS received_count,
            SUM(received_at IS NOT NULL AND delivery_assignment_status='unassigned' AND collection_status='pending') AS ready_count,
            SUM(delivery_assignment_status='assigned' AND collection_status='pending') AS assigned_count,
            SUM(collection_status='collected' OR payment_status='paid') AS collected_count,
            SUM(received_at IS NOT NULL AND collection_status='pending' AND payment_status='unpaid') AS uncollected_count,
            COALESCE(SUM(CASE WHEN received_at IS NOT NULL THEN COALESCE(final_amount_to_collect, base_amount_to_collect, usd_to_collect) ELSE 0 END), 0) AS received_total,
            COALESCE(SUM(CASE WHEN delivery_assignment_status='assigned' THEN COALESCE(final_amount_to_collect, base_amount_to_collect, usd_to_collect) ELSE 0 END), 0) AS assigned_total,
            COALESCE(SUM(CASE WHEN collection_status='collected' OR payment_status='paid' THEN COALESCE(final_amount_to_collect, base_amount_to_collect, usd_to_collect) ELSE 0 END), 0) AS collected_total,
            COALESCE(SUM(CASE WHEN received_at IS NOT NULL AND collection_status='pending' AND payment_status='unpaid' THEN COALESCE(final_amount_to_collect, base_amount_to_collect, usd_to_collect) ELSE 0 END), 0) AS uncollected_total
     FROM cart_customers cc
     JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
     JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
     WHERE cc.user_id=? AND o.month_id=?`,
    [userId, monthId]
  );

  // 8. Cargo receipt metrics
  const cargoReceiptRow = await first(
    pool,
    `SELECT COUNT(DISTINCT sr.cart_id) AS carts_with_receipts
     FROM shipment_receipts sr
     WHERE sr.user_id=? AND sr.month_id=?`,
    [userId, monthId]
  );
  const cartsWithReceipts = Number(cargoReceiptRow?.carts_with_receipts || 0);

  // Derived financial figures
  const estimatedShippingTotal = Math.round((estimatedWeightTotal * kgPrice + Number.EPSILON) * 100) / 100;
  const estimatedProfit = Math.round((orderCollectTotal - orderCostTotal - estimatedShippingTotal + Number.EPSILON) * 100) / 100;
  const estimatedProfitAfterLosses = Math.round((estimatedProfit - lossTotal + Number.EPSILON) * 100) / 100;
  const realizedNetProfit = Math.round((paymentsTotal - orderCostTotal - customsTotal - lossTotal + Number.EPSILON) * 100) / 100;

  const netOutflow = Math.round((orderCostTotal + customsTotal - paymentsTotal + Number.EPSILON) * 100) / 100;
  const remainingBudget = Math.round((budgetTotal - netOutflow + Number.EPSILON) * 100) / 100;
  const actualCash = Math.round((budgetTotal + paymentsTotal - orderCostTotal - customsTotal + Number.EPSILON) * 100) / 100;

  const summary = {
    // Budget & Rates
    budget_total: budgetTotal,
    budget_count: budgetCount,
    kg_price: kgPrice,

    // Orders
    order_count: orderCount,
    order_cost_total: orderCostTotal,
    order_collect_total: orderCollectTotal,
    total_carts_count: totalCartsCount,
    tracked_carts_count: trackedCartsCount,

    // Weight & Shipping Estimates
    estimated_weight_total: estimatedWeightTotal,
    estimated_shipping_total: estimatedShippingTotal,
    actual_weight_total: actualWeightTotal,

    // Customs & Freight
    customs_total: customsTotal,
    customs_count: customsCount,

    // Payments
    payment_count: paymentCount,
    payments_total: paymentsTotal,
    customer_payments_total: customerPaymentsTotal,
    manual_payments_total: manualPaymentsTotal,

    // Losses
    loss_total: lossTotal,

    // Profits & Liquidity
    estimated_profit: estimatedProfit,
    estimated_profit_after_losses: estimatedProfitAfterLosses,
    realized_net_profit: realizedNetProfit,
    net_outflow: netOutflow,
    remaining_budget: remainingBudget,
    actual_cash: actualCash,

    // Cargo & Delivery Pipeline
    carts_with_receipts: cartsWithReceipts,
    customer_count: Number(cRow?.customer_count || 0),
    received_customer_count: Number(cRow?.received_count || 0),
    ready_customer_count: Number(cRow?.ready_count || 0),
    assigned_customer_count: Number(cRow?.assigned_count || 0),
    collected_customer_count: Number(cRow?.collected_count || 0),
    uncollected_customer_count: Number(cRow?.uncollected_count || 0),
    received_customer_total: Number(cRow?.received_total || 0),
    assigned_customer_total: Number(cRow?.assigned_total || 0),
    collected_customer_total: Number(cRow?.collected_total || 0),
    uncollected_customer_total: Number(cRow?.uncollected_total || 0),

    // Reconciliation
    reconciliation: {
      payment_total: paymentsTotal,
      collection_total: Number(cRow?.collected_total || 0),
      payment_collection_difference: Math.round((paymentsTotal - Number(cRow?.collected_total || 0) + Number.EPSILON) * 100) / 100,
      loss_total: lossTotal,
      customs_total: customsTotal,
      customer_payments_total: customerPaymentsTotal,
      manual_payments_total: manualPaymentsTotal,
    },
  };

  // Round any floating point fields in summary
  for (const key of Object.keys(summary)) {
    if (typeof summary[key] === "number") {
      summary[key] = Math.round((summary[key] + Number.EPSILON) * 100) / 100;
    }
  }

  res.json({ ok: true, month, summary });
}));

module.exports = router;
