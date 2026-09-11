const express = require("express");
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireWriteAccess } = require("../middleware/auth");
const { asyncHandler, paths, int, trim, execute, rows, first, placeholders } = require("../lib/helpers");

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
  const userId = Number(req.user.user_id);
  const affected = await withTransaction(async (db) => {
    const month = await first(db, "SELECT id FROM month WHERE id=? AND user_id=? LIMIT 1 FOR UPDATE", [id, userId]);
    if (!month) return 0;

    const orderIds = (await rows(db, "SELECT id FROM orders WHERE month_id=? AND user_id=?", [id, userId])).map((row) => Number(row.id));
    const cartIds = orderIds.length
      ? (await rows(db, `SELECT id FROM order_carts WHERE user_id=? AND order_id IN (${placeholders(orderIds)})`, [userId, ...orderIds])).map((row) => Number(row.id))
      : [];
    const paymentIds = (await rows(db, "SELECT id FROM payments WHERE month_id=? AND user_id=?", [id, userId])).map((row) => Number(row.id));
    const debtIds = (await rows(db, "SELECT id FROM customer_debts WHERE month_id=? AND user_id=?", [id, userId])).map((row) => Number(row.id));

    if (paymentIds.length) {
      await execute(db, `DELETE FROM customer_debt_payments WHERE user_id=? AND payment_id IN (${placeholders(paymentIds)})`, [userId, ...paymentIds]);
      await execute(db, `DELETE FROM payment_customer_items WHERE user_id=? AND payment_id IN (${placeholders(paymentIds)})`, [userId, ...paymentIds]);
    }
    if (debtIds.length) await execute(db, `DELETE FROM customer_debt_payments WHERE user_id=? AND debt_id IN (${placeholders(debtIds)})`, [userId, ...debtIds]);
    if (cartIds.length) await execute(db, `DELETE FROM cart_customers WHERE user_id=? AND cart_id IN (${placeholders(cartIds)})`, [userId, ...cartIds]);
    if (orderIds.length) {
      await execute(db, `DELETE FROM order_customers WHERE user_id=? AND order_id IN (${placeholders(orderIds)})`, [userId, ...orderIds]);
      await execute(db, `DELETE FROM order_carts WHERE user_id=? AND order_id IN (${placeholders(orderIds)})`, [userId, ...orderIds]);
    }
    await execute(db, "DELETE FROM activity_log WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM budget WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM cargo_package_sort_status WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM cargo_payroll_confirmations WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM cargo_payroll_pending WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM delivery_losses WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM customer_debts WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM customs WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM shipment_receipts WHERE user_id=? AND month_id=?", [userId, id]);
    await execute(db, "DELETE FROM payments WHERE user_id=? AND month_id=?", [userId, id]);
    if (orderIds.length) await execute(db, `DELETE FROM orders WHERE user_id=? AND id IN (${placeholders(orderIds)})`, [userId, ...orderIds]);
    const result = await execute(db, "DELETE FROM month WHERE id=? AND user_id=?", [id, userId]);
    return result.affectedRows;
  });
  res.json({ success: true, affected });
}));

module.exports = router;
