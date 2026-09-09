const express = require("express");
const multer = require("multer");
const JSZip = require("jszip");
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireWriteAccess } = require("../middleware/auth");
const {
  asyncHandler, paths, int, number, finite, round2, trim, nullableTrim, placeholders,
  uniquePositiveInts, jsonDecode, execute, first, rows, HttpError,
} = require("../lib/helpers");
const { appendActivity } = require("../lib/activity");
const { refreshJointShipmentForTracking } = require("../lib/jointShipment");
const { callSheinScraper } = require("../lib/shein");

const router = express.Router();
const SHEIN_REFRESH_PATHS = new Set([
  "refreshCartShein",
  "refreshOrderSheinTrack",
  "refreshOrderSheinWeight",
]);
router.use(requireAuth);
router.use((req, res, next) => {
  const action = String(req.path || "").replace(/^\//, "");
  if (req.method === "POST" && SHEIN_REFRESH_PATHS.has(action)) return next();
  // Dashboard users may save the Chrome profile used by a cart refresh. This
  // narrow update does not grant them general cart-edit access.
  if (req.method === "POST" && action === "updateCart"
    && Object.prototype.hasOwnProperty.call(req.body || {}, "chrome_profile_key")
    && Object.keys(req.body || {}).every((key) => ["id", "cart_order_number", "cart_price", "chrome_profile_key"].includes(key))) return next();
  return requireWriteAccess(req, res, next);
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const uid = (req) => Number(req.user.user_id);
const okError = (res, status, error, key = "success") => res.status(status).json({ [key]: false, error });
const isChromeProfileKey = (value) => value === "Default" || /^Profile \d+$/.test(value);
const ensureMonth = async (db, userId, monthId) => Boolean(await first(db, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId]));
const ensureOrder = async (db, userId, orderId) => Boolean(await first(db, "SELECT id FROM orders WHERE id=? AND user_id=? LIMIT 1", [orderId, userId]));
const ensureCart = async (db, userId, cartId) => Boolean(await first(db, "SELECT id FROM order_carts WHERE id=? AND user_id=? LIMIT 1", [cartId, userId]));
const hasColumn = async (db, table, column) => Boolean(await first(db, "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1", [table, column]));

// Carts
router.get(paths("getCarts", true), asyncHandler(async (req, res) => {
  const orderId = int(req.query.order_id);
  if (orderId <= 0) return okError(res, 400, "order_id is required");
  if (!(await ensureOrder(pool, uid(req), orderId))) return okError(res, 403, "Invalid order for this user");
  res.json(await rows(pool, `SELECT id, order_id, cart_order_number, cart_price, shein_email, shein_order_no,
    shein_carrier, shein_tracking_no, shein_status_text, shein_last_details, shein_last_timestamp,
    shein_track_url, shein_delivered, chrome_profile_key, is_joint_shipment, joint_shipment_count, joint_combined_weight_kg,
    joint_combined_weight_plus_2kg, shein_total_weight_g, shein_total_weight_kg, shein_total_weight_plus_2kg,
    shein_is_split_shipment, shein_split_count, shein_split_tracking_numbers_json, shein_split_package_refs_json
    FROM order_carts WHERE order_id=? AND user_id=? ORDER BY id DESC`, [orderId, uid(req)]));
}));

router.post(paths("addCart"), asyncHandler(async (req, res) => {
  const orderId = int(req.body?.order_id); const cartNumber = trim(req.body?.cart_order_number); const price = number(req.body?.cart_price);
  const email = trim(req.body?.shein_email); const orderNo = trim(req.body?.shein_order_no);
  if (orderId <= 0 || !cartNumber || !finite(price) || price < 0) return okError(res, 400, "order_id, cart_order_number, and a valid non-negative cart_price are required");
  if (!(await ensureOrder(pool, uid(req), orderId))) return okError(res, 403, "Invalid order for this user");
  const profileKey = trim(req.body?.chrome_profile_key);
  if (profileKey && !isChromeProfileKey(profileKey)) return okError(res, 400, "chrome_profile_key must be a valid Chrome profile");
  const result = await execute(pool, `INSERT INTO order_carts (order_id, cart_order_number, cart_price, user_id, shein_email, shein_order_no, chrome_profile_key) VALUES (?, ?, ?, ?, ?, ?, ?)`, [orderId, cartNumber, price, uid(req), email, orderNo, profileKey || null]);
  res.json({ success: true, id: Number(result.insertId) });
}));

router.post(paths("updateCart"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const cartNumber = String(req.body?.cart_order_number ?? ""); const price = number(req.body?.cart_price);
  if (id <= 0 || !cartNumber || !finite(price) || price < 0) return okError(res, 400, "id, cart_order_number, and a valid non-negative cart_price are required");
  const existing = await first(pool, "SELECT * FROM order_carts WHERE id=? AND user_id=? LIMIT 1", [id, uid(req)]);
  if (!existing) return okError(res, 403, "Cart not found or not allowed");
  const value = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key) ? (req.body[key] === null ? null : String(req.body[key])) : (existing[key] ?? null);
  const profileKey = value("chrome_profile_key");
  if (profileKey && !isChromeProfileKey(profileKey)) return okError(res, 400, "chrome_profile_key must be a valid Chrome profile");
  const deliveredValue = req.body?.shein_delivered;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "shein_delivered") && ![true, false, 0, 1, "0", "1", "true", "false"].includes(deliveredValue)) return okError(res, 400, "shein_delivered must be a boolean");
  const delivered = Object.prototype.hasOwnProperty.call(req.body || {}, "shein_delivered") ? (deliveredValue === true || deliveredValue === 1 || deliveredValue === "1" || deliveredValue === "true" ? 1 : 0) : Number(existing.shein_delivered || 0);
  const weightG = Object.prototype.hasOwnProperty.call(req.body || {}, "shein_total_weight_g") ? number(req.body.shein_total_weight_g) : (existing.shein_total_weight_g == null ? null : Number(existing.shein_total_weight_g));
  const weightKg = Object.prototype.hasOwnProperty.call(req.body || {}, "shein_total_weight_kg") ? number(req.body.shein_total_weight_kg) : (existing.shein_total_weight_kg == null ? null : Number(existing.shein_total_weight_kg));
  const plus2 = Object.prototype.hasOwnProperty.call(req.body || {}, "shein_total_weight_plus_2kg") ? number(req.body.shein_total_weight_plus_2kg) : (existing.shein_total_weight_plus_2kg == null ? null : Number(existing.shein_total_weight_plus_2kg));
  if ((Object.prototype.hasOwnProperty.call(req.body || {}, "shein_total_weight_g") && (!finite(weightG) || weightG < 0)) || (Object.prototype.hasOwnProperty.call(req.body || {}, "shein_total_weight_kg") && (!finite(weightKg) || weightKg < 0)) || (Object.prototype.hasOwnProperty.call(req.body || {}, "shein_total_weight_plus_2kg") && (!finite(plus2) || plus2 < 0))) return okError(res, 400, "Weight values must be finite non-negative numbers");
  await execute(pool, `UPDATE order_carts SET cart_order_number=?, cart_price=?, shein_email=?, shein_order_no=?, chrome_profile_key=?, shein_carrier=?, shein_tracking_no=?, shein_status_text=?, shein_last_details=?, shein_last_timestamp=?, shein_track_url=?, shein_delivered=?, shein_total_weight_g=?, shein_total_weight_kg=?, shein_total_weight_plus_2kg=? WHERE id=? AND user_id=?`, [
    cartNumber, price, value("shein_email"), value("shein_order_no"), profileKey, value("shein_carrier"), value("shein_tracking_no"), value("shein_status_text"), value("shein_last_details"), value("shein_last_timestamp"), value("shein_track_url"), delivered, weightG, weightKg, plus2, id, uid(req),
  ]);
  await refreshJointShipmentForTracking(pool, uid(req), existing.shein_tracking_no);
  await refreshJointShipmentForTracking(pool, uid(req), value("shein_tracking_no"));
  res.json({ success: true, affected: 1 });
}));

router.post(paths("deleteCart"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); if (id <= 0) return okError(res, 400, "id is required");
  const result = await execute(pool, "DELETE FROM order_carts WHERE id=? AND user_id=?", [id, uid(req)]); res.json({ success: true, affected: result.affectedRows });
}));

// Customers
router.get(paths("getCustomers", true), asyncHandler(async (req, res) => {
  const cartId = int(req.query.cart_id); if (cartId <= 0) return okError(res, 400, "cart_id is required");
  if (!(await ensureCart(pool, uid(req), cartId))) return okError(res, 403, "Invalid cart for this user");
  res.json(await rows(pool, "SELECT id, cart_id, customer_name, usd_to_collect, delivery_charge_usd, delivery_number, status, delivery_status FROM cart_customers WHERE cart_id=? AND user_id=? ORDER BY id DESC", [cartId, uid(req)]));
}));
router.post(paths("addCustomer"), asyncHandler(async (req, res) => {
  const cartId = int(req.body?.cart_id); if (cartId <= 0) return okError(res, 400, "cart_id is required");
  if (!(await ensureCart(pool, uid(req), cartId))) return okError(res, 403, "Invalid cart for this user");
  const amount = number(req.body?.usd_to_collect); const charge = Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_charge_usd") ? number(req.body.delivery_charge_usd) : 0; if (!trim(req.body?.customer_name) || !finite(amount) || amount < 0 || !finite(charge) || charge < 0 || charge > amount) return okError(res, 400, "customer_name, usd_to_collect, and delivery_charge_usd must be valid non-negative values with charge <= amount"); const result = await execute(pool, "INSERT INTO cart_customers (cart_id, customer_name, usd_to_collect, delivery_charge_usd, user_id) VALUES (?, ?, ?, ?, ?)", [cartId, trim(req.body?.customer_name), amount, charge, uid(req)]);
  res.json({ success: true, id: Number(result.insertId) });
}));
router.post(paths("updateCustomer"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const name = trim(req.body?.customer_name); const amount = req.body?.usd_to_collect == null ? null : number(req.body.usd_to_collect);
  const charge = Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_charge_usd") && req.body.delivery_charge_usd !== null ? number(req.body.delivery_charge_usd) : null;
  if (id <= 0 || !name || amount === null || !finite(amount) || amount < 0 || (charge !== null && (!finite(charge) || charge < 0 || charge > amount))) return okError(res, 400, "Invalid input");
  const result = await execute(pool, "UPDATE cart_customers SET customer_name=?, usd_to_collect=?, delivery_charge_usd=COALESCE(?, delivery_charge_usd) WHERE id=? AND user_id=? AND status='pending'", [name, amount, charge, id, uid(req)]);
  if (!result.affectedRows) return okError(res, 403, "Customer not found, not owned, or cannot be edited");
  res.json({ success: true });
}));
router.post(paths("deleteCustomer"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); if (id <= 0) return okError(res, 400, "id is required");
  const result = await execute(pool, "DELETE FROM cart_customers WHERE id=? AND user_id=?", [id, uid(req)]); res.json({ success: true, affected: result.affectedRows });
}));

router.get(paths("getCustomersForDelivery", true), asyncHandler(async (req, res) => {
  const cartId = int(req.query.cart_id); if (cartId <= 0) return okError(res, 400, "cart_id is required");
  if (!(await ensureCart(pool, uid(req), cartId))) return okError(res, 403, "Invalid cart for this user");
  res.json(await rows(pool, "SELECT id, cart_id, customer_name, usd_to_collect, delivery_number, status, delivery_status FROM cart_customers WHERE cart_id=? AND user_id=? ORDER BY id DESC", [cartId, uid(req)]));
}));
router.get(paths("getCustomersForDeliveryByMonth"), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id); if (monthId <= 0) return okError(res, 400, "month_id is required");
  if (!(await ensureMonth(pool, uid(req), monthId))) return okError(res, 403, "Invalid month for this user");
  res.json(await rows(pool, `SELECT cc.id, cc.cart_id, cc.customer_name, cc.usd_to_collect, cc.delivery_charge_usd, cc.delivery_number, cc.status, cc.delivery_status, oc.cart_order_number, oc.order_id, o.order_name FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id WHERE cc.user_id=? AND o.month_id=? ORDER BY cc.id DESC`, [uid(req), monthId]));
}));
router.get(paths("getCustomersWithDeliverytrack", true), asyncHandler(async (req, res) => {
  const search = trim(req.query.search); let sql = `SELECT cc.id AS customer_id, cc.customer_name, cc.usd_to_collect, cc.delivery_charge_usd, cc.delivery_number, cc.status, cc.delivery_status, oc.id AS cart_id, oc.cart_order_number, o.id AS order_id, o.month_id, o.order_details, o.order_name FROM cart_customers cc JOIN order_carts oc ON cc.cart_id=oc.id AND oc.user_id=cc.user_id JOIN orders o ON oc.order_id=o.id AND o.user_id=oc.user_id JOIN month m ON o.month_id=m.id AND m.user_id=cc.user_id WHERE cc.user_id=? AND cc.status='withdelivery' AND m.user_id=?`; const params = [uid(req), uid(req)];
  if (search) { sql += " AND CAST(cc.delivery_number AS CHAR) LIKE ?"; params.push(`%${search}%`); } sql += " ORDER BY cc.id DESC"; res.json(await rows(pool, sql, params));
}));
router.get(paths("getCustomersWithAddedDelivery"), asyncHandler(async (req, res) => {
  const search = trim(req.query.search); let sql = `SELECT cc.id AS customer_id, cc.customer_name, cc.usd_to_collect, cc.delivery_charge_usd, cc.delivery_number, cc.status, cc.delivery_status, oc.id AS cart_id, oc.cart_order_number, o.id AS order_id, o.order_name, o.month_id FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id JOIN month m ON m.id=o.month_id AND m.user_id=cc.user_id WHERE cc.user_id=? AND (cc.delivery_status='added' OR cc.status='confirmed')`; const params = [uid(req)]; if (search) { sql += " AND (cc.customer_name LIKE ? OR CAST(cc.delivery_number AS CHAR) LIKE ? OR oc.cart_order_number LIKE ? OR o.order_name LIKE ?)"; const q = `%${search}%`; params.push(q, q, q, q); } sql += " ORDER BY cc.id DESC"; res.json(await rows(pool, sql, params));
}));

router.post(paths("updateCustomerDelivery"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const deliveryNumber = trim(req.body?.delivery_number); const charge = Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_charge_usd") ? number(req.body.delivery_charge_usd) : null;
  if (id <= 0 || !deliveryNumber || (charge !== null && (!finite(charge) || charge < 0))) return okError(res, 400, "id, delivery_number, and a valid charge are required");
  if (!(await first(pool, `SELECT cc.id FROM cart_customers cc JOIN order_carts oc ON cc.cart_id=oc.id AND oc.user_id=cc.user_id JOIN orders o ON oc.order_id=o.id AND o.user_id=oc.user_id JOIN month m ON o.month_id=m.id AND m.user_id=cc.user_id WHERE cc.id=? AND cc.user_id=? LIMIT 1`, [id, uid(req)]))) return okError(res, 403, "Unauthorized");
  if (await first(pool, "SELECT other.id FROM cart_customers other JOIN order_carts other_cart ON other_cart.id=other.cart_id AND other_cart.user_id=other.user_id JOIN orders other_order ON other_order.id=other_cart.order_id AND other_order.user_id=other.user_id WHERE other.user_id=? AND other.delivery_number=? AND other.id<>? AND other_order.month_id=(SELECT selected_order.month_id FROM cart_customers selected_customer JOIN order_carts selected_cart ON selected_cart.id=selected_customer.cart_id AND selected_cart.user_id=selected_customer.user_id JOIN orders selected_order ON selected_order.id=selected_cart.order_id AND selected_order.user_id=selected_customer.user_id WHERE selected_customer.id=? AND selected_customer.user_id=? LIMIT 1) LIMIT 1", [uid(req), deliveryNumber, id, id, uid(req)])) return res.status(409).json({ success: false, error: "Delivery number already exists" });
  await execute(pool, "UPDATE cart_customers SET delivery_number=?, status='withdelivery', delivery_charge_usd=? WHERE id=? AND user_id=?", [deliveryNumber, charge, id, uid(req)]); res.json({ success: true });
}));
router.post(paths("confirmCustomerDelivery"), asyncHandler(async (req, res) => {
  const id = int(req.body?.customer_id ?? req.body?.id); const amount = Object.prototype.hasOwnProperty.call(req.body || {}, "usd_to_collect") ? number(req.body.usd_to_collect) : null; const charge = Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_charge_usd") ? number(req.body.delivery_charge_usd) : null;
  if (id <= 0 || (amount !== null && (!finite(amount) || amount < 0)) || (charge !== null && (!finite(charge) || charge < 0))) return okError(res, 400, "customer_id and valid non-negative amounts are required");
  const result = await execute(pool, "UPDATE cart_customers SET status='confirmed', usd_to_collect=COALESCE(?,usd_to_collect), delivery_charge_usd=COALESCE(?,delivery_charge_usd) WHERE id=? AND user_id=?", [amount, charge, id, uid(req)]);
  if (!result.affectedRows) return okError(res, 404, "Customer not found for this user"); res.json({ success: true });
}));
router.post(paths("revertCustomerDelivery"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); if (id <= 0) return okError(res, 400, "Invalid customer id");
  const result = await execute(pool, "UPDATE cart_customers SET delivery_status='not added', status='withdelivery' WHERE id=? AND user_id=? AND (delivery_status='added' OR status='confirmed')", [id, uid(req)]); res.json({ success: true, affected: result.affectedRows });
}));
router.post(paths("revertToPending"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id ?? req.body?.customer_id); if (id <= 0) return okError(res, 400, "Missing customer id");
  const result = await execute(pool, `UPDATE cart_customers cc JOIN order_carts oc ON cc.cart_id=oc.id AND oc.user_id=cc.user_id JOIN orders o ON oc.order_id=o.id AND o.user_id=oc.user_id JOIN month m ON o.month_id=m.id AND m.user_id=cc.user_id SET cc.status='pending', cc.delivery_status='not added', cc.delivery_number=NULL WHERE cc.id=? AND cc.user_id=? AND COALESCE(cc.collection_status,'pending')<>'collected' AND COALESCE(cc.payment_status,'unpaid')<>'paid' AND COALESCE(cc.delivery_assignment_status,'unassigned')<>'collected'`, [id, uid(req)]); if (!result.affectedRows) return okError(res, 404, "Customer not found, already collected, or not allowed"); res.json({ success: true });
}));
router.post(paths("updateCustomerUsdToCollect"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const amount = req.body?.usd_to_collect == null ? null : number(req.body.usd_to_collect); if (id <= 0 || amount === null || !finite(amount) || amount < 0) return okError(res, 400, "id and valid usd_to_collect are required"); await execute(pool, "UPDATE cart_customers SET usd_to_collect=? WHERE id=? AND user_id=?", [amount, id, uid(req)]); res.json({ success: true });
}));

// Legacy delivery tracking payment flow.
router.post(paths("markCollected"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id ?? req.body?.customer_id); const amountOverride = Object.prototype.hasOwnProperty.call(req.body || {}, "usd_to_collect") ? number(req.body.usd_to_collect) : null; const chargeOverride = Object.prototype.hasOwnProperty.call(req.body || {}, "delivery_charge_usd") ? number(req.body.delivery_charge_usd) : null;
  if ((amountOverride !== null && (!finite(amountOverride) || amountOverride < 0)) || (chargeOverride !== null && (!finite(chargeOverride) || chargeOverride < 0))) return okError(res, 400, "Amounts must be finite non-negative numbers");
  if (id <= 0) return okError(res, 400, "Missing customer id");
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const current = await first(db, `SELECT cc.id AS customer_id, cc.customer_name, cc.usd_to_collect, cc.delivery_charge_usd, oc.id AS cart_id, oc.cart_order_number, o.id AS order_id, o.order_name, o.month_id FROM cart_customers cc JOIN order_carts oc ON cc.cart_id=oc.id AND oc.user_id=cc.user_id JOIN orders o ON oc.order_id=o.id AND o.user_id=oc.user_id JOIN month m ON o.month_id=m.id AND m.user_id=cc.user_id WHERE cc.id=? AND cc.user_id=? LIMIT 1`, [id, uid(req)]);
    if (!current) throw new HttpError(404, "Customer not found or not allowed", { success: false, error: "Customer not found or not allowed" });
    const finalAmount = amountOverride ?? Number(current.usd_to_collect || 0); const finalCharge = chargeOverride ?? Number(current.delivery_charge_usd || 0); const oldAmount = Number(current.usd_to_collect || 0); const oldCharge = Number(current.delivery_charge_usd || 0);
    await execute(db, `UPDATE cart_customers cc JOIN order_carts oc ON cc.cart_id=oc.id AND oc.user_id=cc.user_id JOIN orders o ON oc.order_id=o.id AND o.user_id=oc.user_id JOIN month m ON o.month_id=m.id AND m.user_id=cc.user_id SET cc.status='collected', cc.delivery_status='added', cc.usd_to_collect=?, cc.delivery_charge_usd=? WHERE cc.id=? AND cc.user_id=?`, [finalAmount, finalCharge, id, uid(req)]);
    let losses = 0; const ref = `${trim(current.customer_name)} | order ${trim(current.order_name || current.order_id)} / cart ${trim(current.cart_order_number || current.cart_id)}`;
    const insertLoss = async (type, amount, signed, description, source) => { await execute(db, `INSERT INTO delivery_losses (month_id,user_id,status,loss_type,amount,signed_diff,description,customer_id,customer_name_snapshot,order_id,order_name_snapshot,cart_id,cart_order_number_snapshot,ref_label,source_key) VALUES (?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?)`, [current.month_id, uid(req), type, amount, signed, description, id, current.customer_name, current.order_id, current.order_name, current.cart_id, current.cart_order_number, ref, source]); losses++; };
    const diff = round2(finalAmount - oldAmount); if (Math.abs(diff) > 0.009) await insertLoss("out of stock item", Math.abs(diff), diff, `Delivery tracking net difference (${diff >= 0 ? "+" : ""}${diff.toFixed(2)})`, `delivery-tracking|amount|${id}|${current.order_id}|${current.cart_id}`);
    const chargeDiff = round2(finalCharge - oldCharge); if (Math.abs(chargeDiff) > 0.009) await insertLoss("delivery charge", Math.abs(chargeDiff), chargeDiff, `Delivery tracking charge difference (${chargeDiff >= 0 ? "+" : ""}${chargeDiff.toFixed(2)})`, `delivery-tracking|charge|${id}|${current.order_id}|${current.cart_id}`);
    await db.commit(); res.json({ success: true, losses_created: losses });
  } catch (e) { try { await db.rollback(); } catch (_) {} throw e; } finally { db.release(); }
}));

router.post(paths("markCustomerPaid"), asyncHandler(async (req, res) => {
  const ids = uniquePositiveInts(req.body?.ids); if (!Array.isArray(req.body?.ids) || !req.body.ids.length) return okError(res, 400, "No customer IDs provided"); if (!ids.length) return okError(res, 400, "Invalid customer IDs");
  const db = await pool.getConnection(); try {
    await db.beginTransaction(); const qs = placeholders(ids); const customers = await rows(db, `SELECT cc.id AS customer_id,cc.usd_to_collect,cc.delivery_charge_usd,cc.customer_name,o.month_id FROM cart_customers cc JOIN order_carts oc ON cc.cart_id=oc.id AND oc.user_id=cc.user_id JOIN orders o ON oc.order_id=o.id AND o.user_id=oc.user_id JOIN month m ON m.id=o.month_id AND m.user_id=cc.user_id WHERE cc.user_id=? AND cc.id IN (${qs}) AND cc.status='confirmed'`, [uid(req), ...ids]);
    if (customers.length !== ids.length) throw new HttpError(400, "One or more customers are not eligible (they must be your customers with status=confirmed).", { success: false, error: "One or more customers are not eligible (they must be your customers with status=confirmed)." });
    const grouped = new Map(); for (const customer of customers) { const key = Number(customer.month_id); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(customer); }
    const itemCharge = await hasColumn(db, "payment_customer_items", "delivery_charge"); const paymentIds = [];
    for (const [monthId, group] of grouped) {
      const total = group.reduce((s, c) => s + Number(c.usd_to_collect || 0), 0); const charge = group.reduce((s, c) => s + Number(c.delivery_charge_usd || 0), 0); const original = total + charge; const customerIdsJson = JSON.stringify(group.map((c) => Number(c.customer_id))); const pay = await execute(db, `INSERT INTO payments (user_id,month_id,payment_amount,payment_type,original_amount,delivery_charge,customer_count,customer_ids_json,note) VALUES (?, ?, ?, 'customers', ?, ?, ?, ?, ?)`, [uid(req), monthId, total, original, charge, group.length, customerIdsJson, "Customer payment (Delivery collection)"]); const paymentId = Number(pay.insertId); paymentIds.push(paymentId);
      for (const c of group) { const args = itemCharge ? [paymentId, c.customer_id, c.customer_name, Number(c.usd_to_collect || 0), Number(c.delivery_charge_usd || 0), uid(req)] : [paymentId, c.customer_id, c.customer_name, Number(c.usd_to_collect || 0), uid(req)]; const sql = itemCharge ? "INSERT INTO payment_customer_items (payment_id,customer_id,customer_name_snapshot,amount,delivery_charge,user_id) VALUES (?, ?, ?, ?, ?, ?)" : "INSERT INTO payment_customer_items (payment_id,customer_id,customer_name_snapshot,amount,user_id) VALUES (?, ?, ?, ?, ?)"; await execute(db, sql, args); }
      await execute(db, `UPDATE cart_customers SET status='paid',delivery_status='paid' WHERE user_id=? AND id IN (${placeholders(group.map((c) => c.customer_id))})`, [uid(req), ...group.map((c) => c.customer_id)]);
    }
    await db.commit(); res.json({ success: true, message: "Payments added and customers marked as paid", payment_ids: paymentIds });
  } catch (e) { try { await db.rollback(); } catch (_) {} throw e; } finally { db.release(); }
}));

// Delivery losses and debts in the legacy ordersDetails namespace.
router.get(paths("getDeliveryLosses"), asyncHandler(async (req, res) => {
  const monthId = int(req.query.month_id); const status = trim(req.query.status).toLowerCase(); if (monthId <= 0) return okError(res, 400, "month_id is required", "ok"); if (!(await ensureMonth(pool, uid(req), monthId))) return okError(res, 403, "Invalid month for this user", "ok"); let sql = "SELECT * FROM delivery_losses WHERE user_id=? AND month_id=?"; const params = [uid(req), monthId]; if (["pending", "confirmed"].includes(status)) { sql += " AND status=?"; params.push(status); } sql += " ORDER BY id DESC"; res.json({ ok: true, rows: await rows(pool, sql, params) });
}));
router.post(paths("addDeliveryLosses"), asyncHandler(async (req, res) => {
  const monthId = int(req.body?.month_id); const inputRows = Array.isArray(req.body?.rows) ? req.body.rows : []; if (monthId <= 0 || !inputRows.length) return okError(res, 400, "month_id and rows are required", "ok"); if (!(await ensureMonth(pool, uid(req), monthId))) return okError(res, 403, "Invalid month for this user", "ok");
  const db = await pool.getConnection(); try { await db.beginTransaction(); let created = 0; for (const r of inputRows) { const type = trim(r?.type); const amount = number(r?.amount); if (!type || amount <= 0) continue; await execute(db, `INSERT INTO delivery_losses (month_id,user_id,status,loss_type,amount,signed_diff,description,customer_id,customer_name_snapshot,order_id,order_name_snapshot,cart_id,cart_order_number_snapshot,ref_label,source_key) VALUES (?,?,'pending',?,?,?,?,?,?,?,?,?,?,?,?)`, [monthId, uid(req), type, amount, number(r.signed_diff), trim(r.description), r.customer_id ? int(r.customer_id) : null, trim(r.customer_name), r.order_id ? int(r.order_id) : null, trim(r.order_name), r.cart_id ? int(r.cart_id) : null, trim(r.cart_order_number), trim(r.ref), trim(r.source_key)]); created++; } await db.commit(); res.json({ ok: true, created }); } catch (e) { try { await db.rollback(); } catch (_) {} throw e; } finally { db.release(); }
}));
router.post(paths("updateDeliveryLoss"), asyncHandler(async (req, res) => { const id = int(req.body?.id); const type = trim(req.body?.loss_type); const amount = req.body?.amount == null ? null : number(req.body.amount); if (id <= 0 || !type || amount === null || !finite(amount) || amount < 0) return okError(res, 400, "Invalid input", "ok"); await execute(pool, "UPDATE delivery_losses SET loss_type=?,amount=?,description=? WHERE id=? AND user_id=? AND status='pending'", [type, amount, trim(req.body?.description), id, uid(req)]); res.json({ ok: true }); }));
router.post(paths("deleteDeliveryLoss"), asyncHandler(async (req, res) => { const id = int(req.body?.id); if (id <= 0) return okError(res, 400, "id is required", "ok"); await execute(pool, "DELETE FROM delivery_losses WHERE id=? AND user_id=? AND status='pending'", [id, uid(req)]); res.json({ ok: true }); }));
router.post(paths("confirmDeliveryLosses"), asyncHandler(async (req, res) => { const monthId = int(req.body?.month_id); const ids = uniquePositiveInts(req.body?.ids); if (monthId <= 0) return okError(res, 400, "month_id is required", "ok"); if (!(await ensureMonth(pool, uid(req), monthId))) return okError(res, 403, "Invalid month for this user", "ok"); const sql = ids.length ? `UPDATE delivery_losses SET status='confirmed',confirmed_at=NOW() WHERE user_id=? AND month_id=? AND status='pending' AND id IN (${placeholders(ids)})` : "UPDATE delivery_losses SET status='confirmed',confirmed_at=NOW() WHERE user_id=? AND month_id=? AND status='pending'"; const result = await execute(pool, sql, ids.length ? [uid(req), monthId, ...ids] : [uid(req), monthId]); res.json({ ok: true, affected: result.affectedRows }); }));

router.get(paths("getCustomerDebts"), asyncHandler(async (req, res) => { const monthId = int(req.query.month_id); const status = trim(req.query.status).toLowerCase(); if (monthId <= 0) return okError(res, 400, "month_id is required", "ok"); if (!(await ensureMonth(pool, uid(req), monthId))) return okError(res, 403, "Invalid month for this user", "ok"); let sql = "SELECT * FROM customer_debts WHERE user_id=? AND month_id=?"; const params = [uid(req), monthId]; if (["open", "partial", "closed"].includes(status)) { sql += " AND status=?"; params.push(status); } sql += " ORDER BY FIELD(status,'open','partial','closed'),id DESC"; res.json({ ok: true, rows: await rows(pool, sql, params) }); }));
router.post(paths("addCustomerDebt"), asyncHandler(async (req, res) => { const monthId = int(req.body?.month_id); const customerId = int(req.body?.customer_id); const amount = round2(req.body?.amount); if (monthId <= 0 || customerId <= 0 || !finite(amount) || amount <= 0) return okError(res, 400, "month_id, customer_id and amount are required", "ok"); if (!(await ensureMonth(pool, uid(req), monthId))) return okError(res, 403, "Invalid month for this user", "ok"); const c = await first(pool, `SELECT cc.id AS customer_id,cc.customer_name,cc.cart_id,oc.cart_order_number,o.id AS order_id,o.order_name FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id WHERE cc.user_id=? AND cc.id=? AND o.month_id=? LIMIT 1`, [uid(req), customerId, monthId]); if (!c) return okError(res, 404, "Customer not found in selected month", "ok"); const result = await execute(pool, `INSERT INTO customer_debts (user_id,month_id,customer_id,customer_name_snapshot,order_id,order_name_snapshot,cart_id,cart_order_number_snapshot,original_amount,outstanding_amount,status,note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`, [uid(req), monthId, customerId, c.customer_name, c.order_id, c.order_name, c.cart_id, c.cart_order_number, amount, amount, trim(req.body?.note)]); res.json({ ok: true, id: Number(result.insertId) }); }));
router.post(paths("updateCustomerDebt"), asyncHandler(async (req, res) => { const id = int(req.body?.id); let outstanding = round2(req.body?.outstanding_amount); const note = Object.prototype.hasOwnProperty.call(req.body || {}, "note") ? nullableTrim(req.body.note) : null; if (id <= 0 || !finite(req.body?.outstanding_amount) || outstanding < 0) return okError(res, 400, "id and valid outstanding_amount are required", "ok"); const debt = await first(pool, "SELECT id,original_amount FROM customer_debts WHERE id=? AND user_id=? LIMIT 1", [id, uid(req)]); if (!debt) return okError(res, 404, "Debt not found", "ok"); const original = Number(debt.original_amount || 0); if (outstanding > original + 0.009) return okError(res, 400, "Outstanding amount cannot exceed original amount", "ok"); let status = "open"; let closedAt = null; if (outstanding <= 0.009) { outstanding = 0; status = "closed"; closedAt = new Date(); } else if (outstanding + 0.009 < original) status = "partial"; await execute(pool, "UPDATE customer_debts SET outstanding_amount=?,status=?,note=COALESCE(?,note),closed_at=? WHERE id=? AND user_id=?", [outstanding, status, note, closedAt, id, uid(req)]); res.json({ ok: true }); }));
router.post(paths("closeCustomerDebt"), asyncHandler(async (req, res) => {
  const id = int(req.body?.id); const paid = round2(req.body?.paid_amount); const note = trim(req.body?.note); if (id <= 0 || !finite(paid) || paid <= 0) return okError(res, 400, "id and paid_amount are required", "ok"); const db = await pool.getConnection(); try { await db.beginTransaction(); const debt = await first(db, "SELECT * FROM customer_debts WHERE id=? AND user_id=? LIMIT 1", [id, uid(req)]); if (!debt) throw new HttpError(404, "Debt not found", { ok: false, error: "Debt not found" }); const outstanding = Number(debt.outstanding_amount || 0); if (outstanding <= 0.009 || String(debt.status).toLowerCase() === "closed") throw new HttpError(400, "Debt is already closed", { ok: false, error: "Debt is already closed" }); if (paid - outstanding > 0.009) throw new HttpError(400, "Paid amount exceeds outstanding debt", { ok: false, error: "Paid amount exceeds outstanding debt" }); const customerName = trim(debt.customer_name_snapshot) || "Customer"; const paymentNote = `Debt payment from ${customerName}${note ? ` - ${note}` : ""}`; const customerIds = JSON.stringify([int(debt.customer_id)]); const pay = await execute(db, `INSERT INTO payments (user_id,month_id,payment_amount,payment_type,original_amount,delivery_charge,customer_count,customer_ids_json,note) VALUES (?, ?, ?, 'manual', NULL, 0, 1, ?, ?)`, [uid(req), debt.month_id, paid, customerIds, paymentNote]); const paymentId = Number(pay.insertId); const hasCharge = await hasColumn(db, "payment_customer_items", "delivery_charge"); const itemSql = hasCharge ? "INSERT INTO payment_customer_items (payment_id,customer_id,customer_name_snapshot,amount,delivery_charge,user_id) VALUES (?, ?, ?, ?, 0, ?)" : "INSERT INTO payment_customer_items (payment_id,customer_id,customer_name_snapshot,amount,user_id) VALUES (?, ?, ?, ?, ?)"; await execute(db, itemSql, hasCharge ? [paymentId, debt.customer_id, customerName, paid, uid(req)] : [paymentId, debt.customer_id, customerName, paid, uid(req)]); await execute(db, "INSERT INTO customer_debt_payments (debt_id,user_id,payment_id,paid_amount,note) VALUES (?, ?, ?, ?, ?)", [id, uid(req), paymentId, paid, note]); const remaining = Math.max(0, round2(outstanding - paid)); const newStatus = remaining <= 0.009 ? "closed" : "partial"; await execute(db, "UPDATE customer_debts SET outstanding_amount=?,status=?,closed_at=? WHERE id=? AND user_id=?", [remaining, newStatus, newStatus === "closed" ? new Date() : null, id, uid(req)]); await db.commit(); res.json({ ok: true, payment_id: paymentId, paid_amount: paid, remaining_amount: remaining, status: newStatus }); } catch (e) { try { await db.rollback(); } catch (_) {} throw e; } finally { db.release(); }
}));

// Delivery-number validation.
router.get(paths("checkDeliveryNumber", true), asyncHandler(async (req, res) => { const cartId = int(req.query.cart_id); const numberValue = trim(req.query.delivery_number); if (cartId <= 0 || !numberValue) return res.status(400).json({ exists: false, error: "cart_id and delivery_number are required" }); if (!(await ensureCart(pool, uid(req), cartId))) return res.status(403).json({ exists: false, error: "Invalid cart for this user" }); const found = await first(pool, "SELECT 1 FROM cart_customers WHERE cart_id=? AND delivery_number=? AND user_id=? LIMIT 1", [cartId, numberValue, uid(req)]); res.json({ exists: Boolean(found) }); }));
router.get(paths("checkDeliveryNumberByMonth"), asyncHandler(async (req, res) => { const monthId = int(req.query.month_id); const numberValue = trim(req.query.delivery_number); if (monthId <= 0 || !numberValue) return res.status(400).json({ exists: false, error: "month_id and delivery_number are required" }); if (!(await ensureMonth(pool, uid(req), monthId))) return res.status(403).json({ exists: false, error: "Invalid month for this user" }); const found = await first(pool, `SELECT cc.id FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id WHERE cc.user_id=? AND o.month_id=? AND CAST(cc.delivery_number AS CHAR)=? LIMIT 1`, [uid(req), monthId, numberValue]); res.json({ exists: Boolean(found) }); }));

// Minimal XLSX parser matching the supported worksheet format.
const xmlUnescape = (value) => String(value).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colIndex = (ref) => { const match = String(ref).match(/^([A-Z]+)/i); if (!match) return -1; return [...match[1].toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1; };
function sharedStrings(xml) { const out = []; for (const m of String(xml || "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi)) out.push([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((x) => xmlUnescape(x[1])).join("")); return out; }
function xlsxRows(sheet, ss) { const out = []; for (const rowMatch of String(sheet).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/gi)) { const rowNum = Number(rowMatch[1].match(/\br="(\d+)"/i)?.[1] || 0); const cells = {}; for (const cell of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) { const attrs = cell[1]; const idx = colIndex(attrs.match(/\br="([^"]+)"/i)?.[1] || ""); if (idx < 0) continue; const type = attrs.match(/\bt="([^"]+)"/i)?.[1] || ""; let value = type === "inlineStr" ? [...cell[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gi)].map((x) => xmlUnescape(x[1])).join("") : xmlUnescape(cell[2].match(/<v\b[^>]*>([\s\S]*?)<\/v>/i)?.[1] || ""); if (type === "s" && value !== "") value = ss[Number(value)] || ""; cells[idx] = value.trim(); } const max = Object.keys(cells).length ? Math.max(...Object.keys(cells).map(Number)) : -1; if (max >= 0) { const dense = Array(max + 1).fill(""); Object.entries(cells).forEach(([i, v]) => { dense[Number(i)] = v; }); out.push({ row_num: rowNum, cells: dense }); } } return out; }
const findHeader = (headers, candidates) => headers.findIndex((v) => candidates.some((c) => String(v).trim().toLowerCase() === c.toLowerCase()));
const excelFloat = (value, label = "amount") => { const s = trim(value).replace(/[,\$]/g, ""); const parsed = Number(s); if (!s || !Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a finite non-negative number`); return parsed; };
const normName = (name) => trim(name).replace(/\([^)]*\)/g, "").replace(/[^a-z0-9\s]+/gi, " ").replace(/\s+/g, " ").toLowerCase();

router.post(paths("previewDeliveryExcelImport", true), upload.single("file"), asyncHandler(async (req, res) => {
  const monthId = int(req.body?.month_id); if (monthId <= 0) return okError(res, 400, "month_id is required", "ok"); if (!req.file) return okError(res, 400, "Excel file is required", "ok"); if (!(await ensureMonth(pool, uid(req), monthId))) return okError(res, 403, "Invalid month for this user", "ok");
  let zip; try { zip = await JSZip.loadAsync(req.file.buffer); const sheet = await zip.file("xl/worksheets/sheet1.xml")?.async("string"); if (!sheet) throw new Error("sheet1.xml not found"); const ss = zip.file("xl/sharedStrings.xml") ? sharedStrings(await zip.file("xl/sharedStrings.xml").async("string")) : []; const parsed = xlsxRows(sheet, ss); if (parsed.length < 2) return okError(res, 400, "Excel file has no data", "ok"); const headers = parsed.find((r) => findHeader(r.cells, ["Status"]) >= 0 && findHeader(r.cells, ["Reciepient Details", "Recipient Details"]) >= 0)?.cells; if (!headers) return okError(res, 400, "Could not detect Excel headers", "ok"); const idxNo = findHeader(headers, ["#", "No", "Number"]), idxStatus = findHeader(headers, ["Status"]), idxRecipient = findHeader(headers, ["Reciepient Details", "Recipient Details"]), idxCharge = findHeader(headers, ["Delivery Amount"]), idxTotal = findHeader(headers, ["Total Amount USD"]); if ([idxNo, idxStatus, idxRecipient, idxCharge, idxTotal].some((i) => i < 0)) return okError(res, 400, "Required columns not found (#, Status, Recipient Details, Delivery Amount, Total Amount USD)", "ok"); const candidates = await rows(pool, `SELECT cc.id AS customer_id,cc.customer_name,cc.usd_to_collect,cc.delivery_charge_usd,cc.delivery_number,cc.status,cc.delivery_status,oc.id AS cart_id,oc.cart_order_number,o.id AS order_id,o.order_name FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id WHERE cc.user_id=? AND o.month_id=? AND (cc.delivery_number IS NULL OR TRIM(CAST(cc.delivery_number AS CHAR))='') AND (cc.delivery_status IS NULL OR cc.delivery_status='not added' OR cc.delivery_status='')`, [uid(req), monthId]); const byName = {}; for (const c of candidates) { const key = normName(c.customer_name); if (!key) continue; (byName[key] ||= []).push({ customer_id: Number(c.customer_id), customer_name: c.customer_name, usd_to_collect: Number(c.usd_to_collect || 0), delivery_charge_usd: c.delivery_charge_usd == null ? null : Number(c.delivery_charge_usd), order_id: Number(c.order_id), order_name: c.order_name || "", cart_id: Number(c.cart_id), cart_order_number: c.cart_order_number || "" }); } const out = []; for (const r of parsed) { const status = trim(r.cells[idxStatus]); const statusKey = status.toLowerCase(); if (!["pending", "confirmed"].includes(statusKey)) continue; const deliveryNumber = trim(r.cells[idxNo]); const recipient = trim(r.cells[idxRecipient]); const total = excelFloat(r.cells[idxTotal]); const charge = excelFloat(r.cells[idxCharge]); if (charge > total) throw new Error("Delivery Amount cannot exceed Total Amount USD"); const net = total - charge; const name = trim(recipient.replace(/\([^)]*\)/g, "")); const matches = byName[normName(name)] || []; const selected = matches.length === 1 ? matches[0] : null; out.push({ excel_row_num: r.row_num, status, delivery_number: deliveryNumber, recipient_details: recipient, customer_name_extracted: name, total_amount_usd: total, delivery_charge_usd: charge, net_amount_usd: net, match_count: matches.length, matches, selected_customer_id: selected?.customer_id ?? null, amount_mismatch: selected ? (Math.abs(selected.usd_to_collect - net) > 0.009 ? 1 : 0) : null }); } res.json({ ok: true, rows: out, summary: { total_rows: out.length, single_matches: out.filter((r) => r.match_count === 1).length, duplicate_matches: out.filter((r) => r.match_count > 1).length, no_matches: out.filter((r) => r.match_count === 0).length } }); } catch (e) { return okError(res, 400, e.message, "ok"); }
}));
router.post(paths("applyDeliveryExcelImport"), asyncHandler(async (req, res) => {
  const monthId = int(req.body?.month_id); const importRows = Array.isArray(req.body?.rows) ? req.body.rows : []; if (monthId <= 0) return okError(res, 400, "month_id is required", "ok"); if (!importRows.length) return okError(res, 400, "rows are required", "ok"); if (!(await ensureMonth(pool, uid(req), monthId))) return okError(res, 403, "Invalid month for this user", "ok"); const selectedIds = uniquePositiveInts(importRows.map((r) => r?.selected_customer_id)); if (!selectedIds.length) return okError(res, 400, "No selected customers in rows", "ok"); const allowed = await rows(pool, `SELECT cc.id FROM cart_customers cc JOIN order_carts oc ON oc.id=cc.cart_id AND oc.user_id=cc.user_id JOIN orders o ON o.id=oc.order_id AND o.user_id=oc.user_id WHERE cc.user_id=? AND o.month_id=? AND cc.id IN (${placeholders(selectedIds)})`, [uid(req), monthId, ...selectedIds]); const allowedSet = new Set(allowed.map((r) => Number(r.id))); const db = await pool.getConnection(); try { await db.beginTransaction(); const applied = [], skipped = []; for (let i=0;i<importRows.length;i++) { const r = importRows[i] || {}; const cid = int(r.selected_customer_id); const status = trim(r.status).toLowerCase(); const dn = trim(r.delivery_number); const total = number(r.total_amount_usd); const charge = number(r.delivery_charge_usd); const rawNet = Object.prototype.hasOwnProperty.call(r, "net_amount_usd") ? number(r.net_amount_usd) : total - charge; if (!finite(r.total_amount_usd) || total < 0 || !finite(r.delivery_charge_usd) || charge < 0 || charge > total || !finite(rawNet) || rawNet < 0 || rawNet > total) throw new HttpError(422, `Excel row ${i + 1} contains invalid amounts`, { ok: false, error: `Excel row ${i + 1} contains invalid amounts` }); const net = rawNet; if (!["pending", "confirmed"].includes(status)) { skipped.push({ row_index: i, reason: "invalid status" }); continue; } if (cid <= 0 || !allowedSet.has(cid)) throw new HttpError(422, `Customer #${cid} is not valid for selected month`, { ok: false, error: `Customer #${cid} is not valid for selected month` }); if (!dn) { skipped.push({ row_index: i, reason: "empty delivery number" }); continue; } if (await first(db, "SELECT other.id FROM cart_customers other JOIN order_carts other_cart ON other_cart.id=other.cart_id AND other_cart.user_id=other.user_id JOIN orders other_order ON other_order.id=other_cart.order_id AND other_order.user_id=other.user_id WHERE other.user_id=? AND other.delivery_number=? AND other.id<>? AND other_order.month_id=(SELECT selected_order.month_id FROM cart_customers selected_customer JOIN order_carts selected_cart ON selected_cart.id=selected_customer.cart_id AND selected_cart.user_id=selected_customer.user_id JOIN orders selected_order ON selected_order.id=selected_cart.order_id AND selected_order.user_id=selected_customer.user_id WHERE selected_customer.id=? AND selected_customer.user_id=? LIMIT 1) LIMIT 1", [uid(req), dn, cid, cid, uid(req)])) { skipped.push({ row_index: i, reason: "delivery number already exists", delivery_number: dn }); continue; } await execute(db, "UPDATE cart_customers SET delivery_number=?,status='withdelivery',usd_to_collect=?,delivery_charge_usd=? WHERE id=? AND user_id=?", [dn, net, charge, cid, uid(req)]); applied.push({ customer_id: cid, delivery_number: dn, usd_to_collect: net, delivery_charge_usd: charge, source_status: status }); } await db.commit(); res.json({ ok: true, applied_count: applied.length, skipped_count: skipped.length, applied, skipped }); } catch (e) { try { await db.rollback(); } catch (_) {} throw e; } finally { db.release(); }
}));

// SHEIN refresh flows. Node owns persistence; Python owns the SHEIN scraping.
// Authentication is provided by the selected logged-in Chrome profile. No
// SHEIN/Gmail account record is required for these refreshes.
function scraperPayload(orderNo, profileKey) {
  return {
    order_no: trim(orderNo),
    profile_key: trim(profileKey),
  };
}
function sheinSplitFields(...records) {
  const trackingNumbers = [];
  const packageRefs = [];
  const addUnique = (target, value) => {
    const normalized = trim(value);
    if (normalized && !target.includes(normalized)) target.push(normalized);
  };
  let hasTrackingArray = false;
  let hasPackageRefArray = false;
  let splitCount = 0;
  let isSplit = false;
  for (const record of records) {
    if (!record) continue;
    isSplit = isSplit || Boolean(record.is_split);
    splitCount = Math.max(splitCount, int(record.split_count));
    if (Array.isArray(record.all_tracking_numbers)) {
      hasTrackingArray = true;
      record.all_tracking_numbers.forEach((value) => addUnique(trackingNumbers, value));
    }
    if (Array.isArray(record.all_package_refs)) {
      hasPackageRefArray = true;
      record.all_package_refs.forEach((value) => addUnique(packageRefs, value));
    }
  }
  splitCount = Math.max(splitCount, trackingNumbers.length);
  isSplit = isSplit || splitCount > 1 || trackingNumbers.length > 1;
  return {
    isSplit,
    splitCount,
    splitTracks: hasTrackingArray ? JSON.stringify(trackingNumbers) : null,
    splitRefs: hasPackageRefArray ? JSON.stringify(packageRefs) : null,
    trackingNumbers,
    packageRefs,
  };
}

async function updateTrack(db, userId, cartId, oldTracking, track, profileKey = null) {
  const split = sheinSplitFields(track);
  await execute(db, `UPDATE order_carts SET chrome_profile_key=COALESCE(?,chrome_profile_key),shein_carrier=?,shein_tracking_no=?,shein_status_text=?,shein_last_details=?,shein_last_timestamp=?,shein_track_url=?,shein_delivered=?,shein_is_split_shipment=?,shein_split_count=?,shein_split_tracking_numbers_json=?,shein_split_package_refs_json=? WHERE id=? AND user_id=?`, [
    profileKey,
    track.carrier ?? null,
    track.tracking_no ?? null,
    track.status_text ?? null,
    track.last_details ?? null,
    track.last_timestamp ?? null,
    track.track_url ?? null,
    track.delivered ? 1 : 0,
    split.isSplit ? 1 : 0,
    split.splitCount,
    split.splitTracks,
    split.splitRefs,
    cartId,
    userId,
  ]);
  await refreshJointShipmentForTracking(db, userId, oldTracking);
  await refreshJointShipmentForTracking(db, userId, track.tracking_no);
}
router.post(paths("refreshCartShein"), asyncHandler(async (req, res) => {
  const cartId = int(req.body?.id);
  const requested = trim(req.body?.profile_key);
  if (cartId <= 0) return okError(res, 400, "Cart id is required", "ok");

  const cart = await first(pool, "SELECT id,cart_order_number,cart_price,shein_order_no,shein_tracking_no,chrome_profile_key FROM order_carts WHERE id=? AND user_id=? LIMIT 1", [cartId, uid(req)]);
  if (!cart) return okError(res, 404, "Cart not found", "ok");
  const orderNo = trim(cart.shein_order_no);
  const profileKey = requested || trim(cart.chrome_profile_key);
  if (!orderNo) return okError(res, 400, "Cart missing SHEIN order number", "ok");
  if (!profileKey || !isChromeProfileKey(profileKey)) return okError(res, 400, "A valid Chrome profile is required", "ok");

  const payload = scraperPayload(orderNo, profileKey);
  const track = await callSheinScraper("track_one", payload);
  if (!track.ok) return res.status(502).json({ ok: false, error: `Track failed: ${track.error}` });
  const weight = await callSheinScraper("weight_one", payload);
  if (!weight.ok) return res.status(502).json({ ok: false, error: `Weight failed: ${weight.error}` });

  const trackData = track.data || {};
  const weightData = weight.data || {};
  const split = sheinSplitFields(trackData, weightData);
  const totalKg = weightData.total_weight_kg == null ? null : Number(weightData.total_weight_kg);
  await execute(pool, `UPDATE order_carts SET chrome_profile_key=?,shein_carrier=?,shein_tracking_no=?,shein_status_text=?,shein_last_details=?,shein_last_timestamp=?,shein_track_url=?,shein_delivered=?,shein_total_weight_g=?,shein_total_weight_kg=?,shein_total_weight_plus_2kg=?,shein_is_split_shipment=?,shein_split_count=?,shein_split_tracking_numbers_json=?,shein_split_package_refs_json=? WHERE id=? AND user_id=?`, [
    profileKey,
    trackData.carrier ?? null,
    trackData.tracking_no ?? null,
    trackData.status_text ?? null,
    trackData.last_details ?? null,
    trackData.last_timestamp ?? null,
    trackData.track_url ?? null,
    trackData.delivered ? 1 : 0,
    weightData.total_weight_g == null ? null : int(weightData.total_weight_g),
    totalKg,
    totalKg == null ? null : totalKg + 2,
    split.isSplit ? 1 : 0,
    split.splitCount,
    split.splitTracks,
    split.splitRefs,
    cartId,
    uid(req),
  ]);
  await refreshJointShipmentForTracking(pool, uid(req), cart.shein_tracking_no);
  await refreshJointShipmentForTracking(pool, uid(req), trackData.tracking_no);
  res.json({ ok: true, track: trackData, weight: weightData, saved: true });
}));
router.post(paths("refreshOrderSheinTrack"), asyncHandler(async (req, res) => {
  const orderId = int(req.body?.order_id ?? req.body?.id);
  const requestedProfile = trim(req.body?.profile_key);
  if (orderId <= 0) return okError(res, 400, "Order id is required", "ok");
  if (!(await ensureOrder(pool, uid(req), orderId))) return okError(res, 404, "Order not found", "ok");
  if (requestedProfile && !isChromeProfileKey(requestedProfile)) return okError(res, 400, "A valid Chrome profile is required", "ok");

  const carts = await rows(pool, "SELECT id,chrome_profile_key,shein_order_no,shein_delivered,shein_tracking_no FROM order_carts WHERE order_id=? AND user_id=? AND COALESCE(shein_delivered,0)=0 ORDER BY id DESC", [orderId, uid(req)]);
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const cart of carts) {
    const orderNo = trim(cart.shein_order_no);
    const profileKey = requestedProfile || trim(cart.chrome_profile_key);
    if (!orderNo || !profileKey || !isChromeProfileKey(profileKey)) {
      skipped++;
      if (!profileKey || !isChromeProfileKey(profileKey)) errors.push(`Cart ${cart.id}: A valid Chrome profile is required`);
      else errors.push(`Cart ${cart.id}: SHEIN order number is required`);
      continue;
    }
    const result = await callSheinScraper("track_one", scraperPayload(orderNo, profileKey));
    if (!result.ok) {
      errors.push(`Cart ${cart.id}: ${result.error}`);
      continue;
    }
    await updateTrack(pool, uid(req), cart.id, cart.shein_tracking_no, result.data, profileKey);
    updated++;
  }

  const agg = await first(pool, "SELECT COALESCE(SUM(COALESCE(shein_total_weight_kg,0)),0) AS total_weight_kg,COALESCE(SUM(COALESCE(shein_total_weight_plus_2kg,0)),0) AS total_weight_plus_2kg,SUM(CASE WHEN COALESCE(shein_delivered,0)=0 AND shein_order_no IS NOT NULL AND TRIM(shein_order_no)<>'' THEN 1 ELSE 0 END) AS undelivered_carts FROM order_carts WHERE order_id=? AND user_id=?", [orderId, uid(req)]);
  res.json({
    ok: true,
    order_id: orderId,
    updated,
    skipped,
    errors,
    summary: {
      total_weight_kg: Number(agg?.total_weight_kg || 0),
      total_weight_plus_2kg: Number(agg?.total_weight_plus_2kg || 0),
      undelivered_carts: Number(agg?.undelivered_carts || 0),
    },
  });
}));
router.post(paths("refreshOrderSheinWeight"), asyncHandler(async (req, res) => {
  const orderId = int(req.body?.order_id ?? req.body?.id);
  const requestedProfile = trim(req.body?.profile_key);
  if (orderId <= 0) return okError(res, 400, "Order id is required", "ok");
  if (!(await ensureOrder(pool, uid(req), orderId))) return okError(res, 404, "Order not found", "ok");
  if (requestedProfile && !isChromeProfileKey(requestedProfile)) return okError(res, 400, "A valid Chrome profile is required", "ok");

  const carts = await rows(pool, "SELECT id,chrome_profile_key,shein_order_no,shein_tracking_no FROM order_carts WHERE order_id=? AND user_id=? ORDER BY id DESC", [orderId, uid(req)]);
  const groups = new Map();
  const touched = new Set();
  let skipped = 0;
  let updated = 0;
  const errors = [];

  for (const cart of carts) {
    const oldTracking = trim(cart.shein_tracking_no);
    if (oldTracking) touched.add(oldTracking);
    const orderNo = trim(cart.shein_order_no);
    const profileKey = requestedProfile || trim(cart.chrome_profile_key);
    if (!profileKey || !orderNo || !isChromeProfileKey(profileKey)) {
      skipped++;
      if (!profileKey || !isChromeProfileKey(profileKey)) errors.push(`Cart ${cart.id}: A valid Chrome profile is required`);
      else errors.push(`Cart ${cart.id}: SHEIN order number is required`);
      continue;
    }
    if (!groups.has(profileKey)) groups.set(profileKey, { profileKey, orders: new Map() });
    const group = groups.get(profileKey);
    if (!group.orders.has(orderNo)) group.orders.set(orderNo, []);
    group.orders.get(orderNo).push(cart.id);
  }

  for (const group of groups.values()) {
    const orderNos = [...group.orders.keys()];
    const result = await callSheinScraper("weight_many", {
      ...scraperPayload("", group.profileKey),
      order_nos: orderNos,
    });
    if (!result.ok) {
      for (const ids of group.orders.values()) {
        for (const id of ids) errors.push(`Cart ${id}: ${result.error}`);
      }
      continue;
    }

    const byOrder = new Map(
      (Array.isArray(result.data?.results) ? result.data.results : [])
        .filter((row) => row && trim(row.order_no))
        .map((row) => [trim(row.order_no), row])
    );

    for (const [orderNo, ids] of group.orders) {
      const row = byOrder.get(orderNo);
      if (!row) {
        for (const id of ids) errors.push(`Cart ${id}: Missing weight result for order ${orderNo}`);
        continue;
      }
      if (row.ok === false) {
        const message = trim(row.error) || "Weight fetch failed";
        for (const id of ids) errors.push(`Cart ${id}: ${message}`);
        continue;
      }

      const weightKg = row.total_weight_kg == null ? null : Number(row.total_weight_kg);
      const split = sheinSplitFields(row);
      for (const id of ids) {
        await execute(pool, `UPDATE order_carts SET chrome_profile_key=?,shein_total_weight_g=?,shein_total_weight_kg=?,shein_total_weight_plus_2kg=?,shein_is_split_shipment=?,shein_split_count=?,shein_split_tracking_numbers_json=?,shein_split_package_refs_json=? WHERE id=? AND user_id=?`, [
          group.profileKey,
          row.total_weight_g == null ? null : int(row.total_weight_g),
          weightKg,
          weightKg == null ? null : weightKg + 2,
          split.isSplit ? 1 : 0,
          split.splitCount,
          split.splitTracks,
          split.splitRefs,
          id,
          uid(req),
        ]);
        updated++;
      }
    }
  }

  for (const tracking of touched) await refreshJointShipmentForTracking(pool, uid(req), tracking);
  const agg = await first(pool, "SELECT COALESCE(SUM(COALESCE(shein_total_weight_kg,0)),0) AS total_weight_kg,COALESCE(SUM(COALESCE(shein_total_weight_plus_2kg,0)),0) AS total_weight_plus_2kg FROM order_carts WHERE order_id=? AND user_id=?", [orderId, uid(req)]);
  res.json({
    ok: true,
    order_id: orderId,
    updated,
    skipped,
    errors,
    summary: {
      total_weight_kg: Number(agg?.total_weight_kg || 0),
      total_weight_plus_2kg: Number(agg?.total_weight_plus_2kg || 0),
    },
  });
}));

module.exports = router;
