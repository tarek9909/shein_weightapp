const express = require("express");
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireWriteAccess } = require("../middleware/auth");
const { asyncHandler, paths, int, number, finite, trim, execute, rows, first, placeholders, uniquePositiveInts } = require("../lib/helpers");

const router = express.Router();
router.use(requireAuth, requireWriteAccess);
const userId = (req) => Number(req.user.user_id);

router.get(paths("getOrders", true), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id);
  if (monthId <= 0) return res.status(400).json({ success: false, error: "month_id is required" });
  if (!(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId(req)]))) return res.status(403).json({ success: false, error: "Invalid month for this user" });
  res.json(await rows(pool, `SELECT o.id, o.month_id, o.order_name, o.order_details, o.amount_to_collect,
    COALESCE((SELECT COUNT(*) FROM order_carts oc WHERE oc.order_id=o.id AND oc.user_id=o.user_id), 0) AS carts_count,
    COALESCE((SELECT SUM(oc.cart_price) FROM order_carts oc WHERE oc.order_id=o.id AND oc.user_id=o.user_id), 0) AS carts_price_sum,
    COALESCE((SELECT SUM(oc.shein_total_weight_kg) FROM order_carts oc WHERE oc.order_id=o.id AND oc.user_id=o.user_id), 0) AS shein_total_weight_kg_sum,
    COALESCE((SELECT SUM(oc.shein_total_weight_plus_2kg) FROM order_carts oc WHERE oc.order_id=o.id AND oc.user_id=o.user_id), 0) AS shein_total_weight_plus_2kg_sum,
    COALESCE((SELECT SUM(CASE WHEN oc.is_joint_shipment=1 THEN 1 ELSE 0 END) FROM order_carts oc WHERE oc.order_id=o.id AND oc.user_id=o.user_id), 0) AS joint_shipment_carts,
    COALESCE((SELECT SUM(CASE WHEN COALESCE(oc.shein_delivered,0)=0 AND oc.shein_order_no IS NOT NULL AND TRIM(oc.shein_order_no)<>'' THEN 1 ELSE 0 END) FROM order_carts oc WHERE oc.order_id=o.id AND oc.user_id=o.user_id), 0) AS shein_undelivered_carts,
    COALESCE((SELECT COUNT(DISTINCT ocu.customer_id) FROM order_customers ocu WHERE ocu.order_id=o.id AND ocu.user_id=o.user_id), 0) AS customer_count,
    COALESCE((
      SELECT COUNT(cc.id)
      FROM cart_customers cc
      JOIN order_carts oc2 ON cc.cart_id=oc2.id AND oc2.user_id=cc.user_id
      WHERE oc2.order_id=o.id AND oc2.user_id=o.user_id
    ), 0) AS cart_customers_count,
    COALESCE((
      SELECT SUM(cc.usd_to_collect)
      FROM cart_customers cc
      JOIN order_carts oc2 ON cc.cart_id=oc2.id AND oc2.user_id=cc.user_id
      WHERE oc2.order_id=o.id AND oc2.user_id=o.user_id
    ), 0) AS customers_collect_sum,
    COALESCE((
      SELECT SUM(CASE WHEN cc.collection_status='collected' OR cc.payment_status='paid' THEN cc.usd_to_collect ELSE 0 END)
      FROM cart_customers cc
      JOIN order_carts oc2 ON cc.cart_id=oc2.id AND oc2.user_id=cc.user_id
      WHERE oc2.order_id=o.id AND oc2.user_id=o.user_id
    ), 0) AS customers_collected_sum
    FROM orders o
    WHERE o.month_id=? AND o.user_id=?
    ORDER BY o.id DESC`, [monthId, userId(req)]));
}));

router.get("/:id/customers", asyncHandler(async (req, res) => {
  const orderId = int(req.params.id);
  if (orderId <= 0) return res.status(400).json({ success: false, error: "A valid order id is required" });
  if (!(await first(pool, "SELECT id FROM orders WHERE id=? AND user_id=? LIMIT 1", [orderId, userId(req)]))) {
    return res.status(404).json({ success: false, error: "Order not found" });
  }
  const customers = await rows(pool, `SELECT c.id, c.customer_name, c.phone, c.notes
    FROM order_customers ocu
    INNER JOIN customers c ON c.id=ocu.customer_id AND c.user_id=ocu.user_id
    WHERE ocu.order_id=? AND ocu.user_id=? ORDER BY c.customer_name ASC`, [orderId, userId(req)]);
  res.json({ success: true, customers });
}));

async function validateCustomerIds(db, userIdValue, rawCustomerIds) {
  if (rawCustomerIds == null) return [];
  if (!Array.isArray(rawCustomerIds)) throw new Error("customer_ids must be an array");
  const customerIds = uniquePositiveInts(rawCustomerIds);
  if (customerIds.length !== new Set(rawCustomerIds.map((value) => Number(value))).size) {
    throw new Error("customer_ids contains invalid values");
  }
  if (!customerIds.length) return [];
  const owned = await rows(db, `SELECT id FROM customers WHERE user_id=? AND id IN (${placeholders(customerIds)})`, [userIdValue, ...customerIds]);
  if (owned.length !== customerIds.length) throw new Error("One or more selected customers do not belong to this user");
  return customerIds;
}

router.post(paths("addOrder"), asyncHandler(async (req, res) => {
  const monthId = int(req.body?.month_id); const name = req.body?.order_name == null ? null : trim(req.body.order_name);
  const details = req.body?.order_details == null ? "" : String(req.body.order_details);
  const amount = number(req.body?.amount_to_collect, 0);
  if (monthId <= 0 || details === "") return res.status(400).json({ success: false, error: "month_id and order_details are required" });
  if (!finite(amount) || amount < 0) return res.status(400).json({ success: false, error: "amount_to_collect must be a finite number >= 0" });
  if (!(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId(req)]))) return res.status(403).json({ success: false, error: "Invalid month for this user" });
  let customerIds;
  try {
    customerIds = await validateCustomerIds(pool, userId(req), req.body?.customer_ids);
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
  const orderId = await withTransaction(async (db) => {
    const result = await execute(db, "INSERT INTO orders (month_id, order_name, order_details, amount_to_collect, user_id) VALUES (?, ?, ?, ?, ?)", [monthId, name, details, amount, userId(req)]);
    const id = Number(result.insertId);
    for (const customerId of customerIds) {
      await execute(db, "INSERT INTO order_customers (order_id, customer_id, user_id) VALUES (?, ?, ?)", [id, customerId, userId(req)]);
    }
    return id;
  });
  res.json({ success: true, id: orderId, customer_ids: customerIds, customer_count: customerIds.length });
}));

router.post(paths("updateOrder"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const name = req.body?.order_name == null ? null : trim(req.body.order_name);
  const details = req.body?.order_details == null ? "" : String(req.body.order_details); const amount = number(req.body?.amount_to_collect, 0);
  if (id <= 0 || details === "") return res.status(400).json({ success: false, error: "id and order_details are required" });
  if (!finite(amount) || amount < 0) return res.status(400).json({ success: false, error: "amount_to_collect must be a finite number >= 0" });
  const result = await execute(pool, "UPDATE orders SET order_name=?, order_details=?, amount_to_collect=? WHERE id=? AND user_id=?", [name, details, amount, id, userId(req)]);
  res.json({ success: true, affected: result.affectedRows });
}));

router.post(paths("deleteOrder"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); if (id <= 0) return res.status(400).json({ success: false, error: "id is required" });
  const result = await execute(pool, "DELETE FROM orders WHERE id=? AND user_id=?", [id, userId(req)]);
  res.json({ success: true, affected: result.affectedRows });
}));

module.exports = router;
