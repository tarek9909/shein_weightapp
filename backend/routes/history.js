const express = require("express");
const { pool } = require("../config/db");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler, paths, int, trim, first, rows, jsonDecode } = require("../lib/helpers");

const router = express.Router();
router.use(requireAuth);
const uid = (req) => Number(req.user.user_id);

router.get(paths("getHistory", true), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id);
  if (monthId <= 0) return res.status(400).json({ ok: false, error: "month_id is required" });
  const month = await first(pool, "SELECT id,name FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, uid(req)]);
  if (!month) return res.status(404).json({ ok: false, error: "Month not found" });
  const c = await first(pool, "SELECT COALESCE(SUM(customs_fee),0) AS total FROM customs WHERE month_id=? AND user_id=?", [monthId, uid(req)]);
  const p = await first(pool, "SELECT COALESCE(SUM(payment_amount),0) AS total FROM payments WHERE month_id=? AND user_id=?", [monthId, uid(req)]);
  const orderRows = await rows(pool, "SELECT id,month_id,order_name,order_details,CAST(order_details AS DECIMAL(10,2)) AS paid_amount FROM orders WHERE month_id=? AND user_id=? ORDER BY id DESC", [monthId, uid(req)]);
  const orders = orderRows.map((o) => ({ id: Number(o.id), order_name: o.order_name, order_details: o.order_details, paid_amount: Number(o.paid_amount || 0), collected_total: 0, carts: [] }));
  const orderIndex = new Map(orders.map((o, i) => [o.id, i]));
  const orderIds = orders.map((o) => o.id);
  let carts = [];
  if (orderIds.length) {
    const cartRows = await rows(pool, `SELECT id AS cart_id,order_id,cart_order_number,cart_price FROM order_carts WHERE order_id IN (${orderIds.map(() => "?").join(",")}) AND user_id=? ORDER BY id DESC`, [...orderIds, uid(req)]);
    carts = cartRows.map((c) => ({ cart_id: Number(c.cart_id), order_id: Number(c.order_id), cart_order_number: c.cart_order_number, cart_price: Number(c.cart_price || 0), collected_total: 0, customers: [] }));
    const cartIds = carts.map((c) => c.cart_id);
    if (cartIds.length) {
      const customers = await rows(pool, `SELECT id,cart_id,customer_name,usd_to_collect,delivery_number,status,delivery_status FROM cart_customers WHERE cart_id IN (${cartIds.map(() => "?").join(",")}) AND user_id=? ORDER BY id DESC`, [...cartIds, uid(req)]);
      const cartIndex = new Map(carts.map((c, i) => [c.cart_id, i]));
      for (const row of customers) {
        const customer = { id: Number(row.id), customer_name: row.customer_name, usd_to_collect: Number(row.usd_to_collect || 0), delivery_number: row.delivery_number == null ? null : Number(row.delivery_number), status: row.status, delivery_status: row.delivery_status };
        const index = cartIndex.get(Number(row.cart_id));
        if (index == null) continue;
        carts[index].customers.push(customer);
        carts[index].collected_total += customer.usd_to_collect;
      }
    }
  }
  let collected = 0;
  for (const cart of carts) {
    const index = orderIndex.get(cart.order_id);
    if (index == null) continue;
    orders[index].carts.push(cart);
    orders[index].collected_total += cart.collected_total;
  }
  for (const order of orders) collected += order.collected_total;
  res.json({ ok: true, month, summary: { customs_fee: Number(c?.total || 0), payments_total: Number(p?.total || 0), orders_paid_total: orders.reduce((sum, o) => sum + o.paid_amount, 0), orders_collected_total: collected }, orders });
}));

router.get(paths("getActivity"), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id);
  const entity = trim(req.query.entity_type);
  const action = trim(req.query.action);
  const query = trim(req.query.q);
  const from = trim(req.query.from);
  const to = trim(req.query.to);
  if (monthId <= 0) return res.status(400).json({ ok: false, error: "month_id is required" });
  if (!(await first(pool, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, uid(req)]))) return res.status(403).json({ ok: false, error: "Invalid month for this user" });
  let sql = "SELECT id,month_id,entity_type,entity_id,action,before_json,after_json,metadata_json,created_by,created_at FROM activity_log WHERE user_id=? AND month_id=?";
  const params = [uid(req), monthId];
  if (entity) { sql += " AND entity_type=?"; params.push(entity); }
  if (action) { sql += " AND action=?"; params.push(action); }
  if (from) { sql += " AND created_at>=?"; params.push(`${from} 00:00:00`); }
  if (to) { sql += " AND created_at<=?"; params.push(`${to} 23:59:59`); }
  if (query) {
    const like = `%${query}%`;
    sql += " AND (action LIKE ? OR entity_type LIKE ? OR CAST(entity_id AS CHAR) LIKE ? OR before_json LIKE ? OR after_json LIKE ? OR metadata_json LIKE ?)";
    params.push(like, like, like, like, like, like);
  }
  sql += " ORDER BY created_at DESC,id DESC LIMIT 1000";
  const events = await rows(pool, sql, params);
  res.json({ ok: true, events: events.map((row) => ({
    ...row,
    id: Number(row.id),
    entity_id: row.entity_id == null ? null : Number(row.entity_id),
    created_by: Number(row.created_by),
    before_json: jsonDecode(row.before_json, null),
    after_json: jsonDecode(row.after_json, null),
    metadata_json: jsonDecode(row.metadata_json, null),
  })) });
}));

module.exports = router;
