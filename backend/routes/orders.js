const express = require("express");
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireWriteAccess } = require("../middleware/auth");
const { asyncHandler, paths, int, number, finite, trim, execute, rows, first, placeholders, uniquePositiveInts } = require("../lib/helpers");
const { appendActivity } = require("../lib/activity");

const router = express.Router();
router.use(requireAuth, requireWriteAccess);
const userId = (req) => Number(req.user.user_id);

router.get(paths("getOrders", true), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id);
  if (monthId <= 0) return res.status(400).json({ success: false, error: "month_id is required" });
  if (!(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId(req)]))) return res.status(403).json({ success: false, error: "Invalid month for this user" });
  res.json(await rows(pool, `SELECT o.id, o.month_id, o.order_name, o.order_details, o.amount_to_collect,
    o.profit_put_aside, o.profit_put_aside_at,
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
      SELECT SUM(CASE WHEN cc.collection_status='collected' OR cc.payment_status='paid' OR cc.status='paid' OR cc.delivery_status='paid' THEN cc.usd_to_collect ELSE 0 END)
      FROM cart_customers cc
      JOIN order_carts oc2 ON cc.cart_id=oc2.id AND oc2.user_id=cc.user_id
      WHERE oc2.order_id=o.id AND oc2.user_id=o.user_id
    ), 0) AS customers_collected_sum,
    COALESCE(
      (SELECT SUM(c.customs_fee) FROM customs c WHERE c.order_id=o.id AND c.user_id=o.user_id),
      (SELECT SUM(oc.shein_total_weight_plus_2kg * COALESCE(s.kg_price, 0)) FROM order_carts oc LEFT JOIN user_settings s ON s.user_id=o.user_id WHERE oc.order_id=o.id AND oc.user_id=o.user_id),
      0
    ) AS customs_sum,
    COALESCE(
      (SELECT SUM(dl.amount) FROM delivery_losses dl WHERE dl.order_id=o.id AND dl.user_id=o.user_id AND dl.status='confirmed' AND dl.reversed_at IS NULL),
      0
    ) AS losses_sum
    FROM orders o
    WHERE o.month_id=? AND o.user_id=?
    ORDER BY o.id DESC`, [monthId, userId(req)]));
}));

router.get([...paths("getOrderCustomers", true), "/:id/orderCustomers"], asyncHandler(async (req, res) => {
  const orderId = int(req.query.order_id || req.params.id);
  if (orderId <= 0) return res.status(400).json({ success: false, error: "A valid order id is required" });
  const order = await first(pool, `SELECT o.id, o.month_id, o.order_name, o.order_details, o.amount_to_collect, o.profit_put_aside, o.profit_put_aside_at,
    COALESCE(
      (SELECT SUM(c.customs_fee) FROM customs c WHERE c.order_id=o.id AND c.user_id=o.user_id),
      (SELECT SUM(oc.shein_total_weight_plus_2kg * COALESCE(s.kg_price, 0)) FROM order_carts oc LEFT JOIN user_settings s ON s.user_id=o.user_id WHERE oc.order_id=o.id AND oc.user_id=o.user_id),
      0
    ) AS customs_sum,
    COALESCE(
      (SELECT SUM(dl.amount) FROM delivery_losses dl WHERE dl.order_id=o.id AND dl.user_id=o.user_id AND dl.status='confirmed' AND dl.reversed_at IS NULL),
      0
    ) AS losses_sum
    FROM orders o WHERE o.id=? AND o.user_id=? LIMIT 1`, [orderId, userId(req)]);
  if (!order) return res.status(404).json({ success: false, error: "Order not found" });

  const customers = await rows(pool, `SELECT cc.id AS customer_id, cc.customer_name, cc.usd_to_collect, cc.delivery_charge_usd,
    cc.delivery_number, cc.status, cc.delivery_status, cc.collection_status, cc.payment_status,
    cc.collected_at, cc.received_at, cc.cart_id, oc.cart_order_number,
    o.id AS order_id, o.order_name, o.month_id,
    COALESCE((SELECT SUM(dl.amount) FROM delivery_losses dl WHERE dl.customer_id=cc.id AND dl.user_id=cc.user_id AND dl.status='confirmed' AND dl.reversed_at IS NULL), 0) AS losses_sum
    FROM cart_customers cc
    JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
    JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id
    WHERE cc.user_id=? AND o.id=?
    ORDER BY cc.id DESC`, [userId(req), orderId]);

  res.json({
    success: true,
    order: {
      ...order,
      id: Number(order.id),
      order_details_cost: Number(order.order_details) || 0,
      amount_to_collect: Number(order.amount_to_collect || 0),
      customs_sum: Number(order.customs_sum || 0),
      losses_sum: Number(order.losses_sum || 0),
      profit_put_aside: order.profit_put_aside != null ? Number(order.profit_put_aside) : null,
      profit_put_aside_at: order.profit_put_aside_at || null,
    },
    customers: customers.map((c) => {
      const isCollected = c.collection_status === 'collected' || c.payment_status === 'paid' || c.status === 'paid' || c.delivery_status === 'paid';
      return {
        ...c,
        customer_id: Number(c.customer_id),
        cart_id: Number(c.cart_id),
        order_id: Number(c.order_id),
        month_id: Number(c.month_id),
        usd_to_collect: Number(c.usd_to_collect || 0),
        delivery_charge_usd: Number(c.delivery_charge_usd || 0),
        losses_sum: Number(c.losses_sum || 0),
        is_collected: isCollected,
      };
    }),
  });
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

router.post(paths("collectCustomerPayment"), asyncHandler(async (req, res) => {
  const customerId = int(req.body?.customer_id);
  if (customerId <= 0) return res.status(400).json({ success: false, error: "customer_id is required" });
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const customer = await first(db, `SELECT cc.id AS customer_id, cc.customer_name, cc.usd_to_collect, cc.delivery_charge_usd, cc.status, cc.delivery_status, cc.collection_status, cc.payment_status, cc.collection_payment_id, oc.id AS cart_id, oc.cart_order_number, o.id AS order_id, o.order_name, o.month_id
      FROM cart_customers cc
      JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id
      JOIN orders o ON oc.order_id=o.id AND o.user_id=oc.user_id
      WHERE cc.id=? AND cc.user_id=? LIMIT 1 FOR UPDATE`, [customerId, userId(req)]);
    if (!customer) throw new Error("Customer not found");

    const alreadyCollected = customer.collection_status === "collected" || customer.payment_status === "paid" || customer.status === "paid" || customer.delivery_status === "paid";
    if (alreadyCollected) {
      await db.commit();
      return res.json({ success: true, message: "Customer payment already collected", customer_id: customerId, idempotent: true });
    }

    const rawAmount = req.body?.amount !== undefined ? number(req.body?.amount) : Number(customer.usd_to_collect || 0);
    const rawCharge = req.body?.delivery_charge !== undefined ? number(req.body?.delivery_charge) : Number(customer.delivery_charge_usd || 0);
    if (!finite(rawAmount) || rawAmount < 0 || !finite(rawCharge) || rawCharge < 0 || rawCharge > rawAmount) {
      throw new Error("Amount and delivery charge must be valid non-negative numbers with charge <= amount");
    }
    const net = Math.round((rawAmount - rawCharge) * 100) / 100;
    const note = trim(req.body?.note) || `Direct collection for ${customer.customer_name} (${customer.order_name})`;

    const payment = await execute(db, `INSERT INTO payments (user_id, month_id, payment_amount, payment_type, original_amount, delivery_charge, customer_count, customer_ids_json, note) VALUES (?, ?, ?, 'customers', ?, ?, 1, ?, ?)`, [userId(req), customer.month_id, net, rawAmount, rawCharge, JSON.stringify([customerId]), note]);
    const paymentId = Number(payment.insertId);

    await execute(db, `INSERT INTO payment_customer_items (payment_id, customer_id, customer_name_snapshot, amount, delivery_charge, user_id, order_id, order_name_snapshot, cart_id, cart_order_number_snapshot, base_amount, delivery_adjustment, final_amount, collected_at, collection_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`, [paymentId, customerId, customer.customer_name, rawAmount, rawCharge, userId(req), customer.order_id, customer.order_name, customer.cart_id, customer.cart_order_number, rawAmount, 0, net, `order-collection:${customerId}:${paymentId}`]);

    await execute(db, `UPDATE cart_customers SET collection_status='collected', payment_status='paid', status='paid', delivery_status='paid', usd_to_collect=?, delivery_charge_usd=?, collection_payment_id=?, collected_at=NOW() WHERE id=? AND user_id=?`, [rawAmount, rawCharge, paymentId, customerId, userId(req)]);

    await appendActivity(db, userId(req), Number(customer.month_id), "customer", customerId, "customer_collected", { collection_status: customer.collection_status, payment_status: customer.payment_status }, { collection_status: "collected", payment_status: "paid", payment_id: paymentId, final_amount: net });

    await db.commit();
    res.json({ success: true, payment_id: paymentId, customer_id: customerId, collected_amount: rawAmount, net_amount: net });
  } catch (err) {
    try { await db.rollback(); } catch (_) {}
    res.status(400).json({ success: false, error: err.message || "Failed to collect payment" });
  } finally {
    db.release();
  }
}));

router.post(paths("putProfitAside"), asyncHandler(async (req, res) => {
  const orderId = int(req.body?.order_id);
  if (orderId <= 0) return res.status(400).json({ success: false, error: "order_id is required" });
  const order = await first(pool, "SELECT id, month_id, order_name, profit_put_aside, profit_put_aside_at FROM orders WHERE id=? AND user_id=? LIMIT 1", [orderId, userId(req)]);
  if (!order) return res.status(404).json({ success: false, error: "Order not found" });

  const clear = Boolean(req.body?.clear);
  if (clear) {
    await execute(pool, "UPDATE orders SET profit_put_aside=NULL, profit_put_aside_at=NULL WHERE id=? AND user_id=?", [orderId, userId(req)]);
    await appendActivity(pool, userId(req), Number(order.month_id), "order", orderId, "profit_cleared", { profit_put_aside: order.profit_put_aside }, { profit_put_aside: null });
    return res.json({ success: true, order_id: orderId, profit_put_aside: null, profit_put_aside_at: null });
  }

  const amount = number(req.body?.amount);
  if (!finite(amount)) return res.status(400).json({ success: false, error: "A valid numeric amount is required" });

  await execute(pool, "UPDATE orders SET profit_put_aside=?, profit_put_aside_at=NOW() WHERE id=? AND user_id=?", [amount, orderId, userId(req)]);
  await appendActivity(pool, userId(req), Number(order.month_id), "order", orderId, "profit_put_aside", { profit_put_aside: order.profit_put_aside }, { profit_put_aside: amount, profit_put_aside_at: new Date().toISOString() });

  res.json({ success: true, order_id: orderId, profit_put_aside: amount, profit_put_aside_at: new Date().toISOString() });
}));

module.exports = router;
