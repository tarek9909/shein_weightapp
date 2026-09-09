const express = require("express");
const { pool, withTransaction } = require("../config/db");
const { requireAuth, requireWriteAccess } = require("../middleware/auth");
const { asyncHandler, int, trim, placeholders, rows, first, execute } = require("../lib/helpers");

const router = express.Router();
const uid = (req) => Number(req.user.user_id);

router.use(requireAuth);

function customerView(row) {
  return {
    id: Number(row.id),
    customer_name: row.customer_name,
    phone: row.phone || "",
    notes: row.notes || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeCustomer(input) {
  return {
    customer_name: trim(input?.customer_name ?? input?.name),
    phone: trim(input?.phone) || null,
    notes: trim(input?.notes) || null,
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const query = trim(req.query.q);
  const like = `%${query}%`;
  const customerRows = await rows(
    pool,
    `SELECT id, customer_name, phone, notes, created_at, updated_at
     FROM customers
     WHERE user_id=? AND (?='' OR customer_name LIKE ? OR COALESCE(phone,'') LIKE ? OR COALESCE(notes,'') LIKE ?)
     ORDER BY customer_name ASC, id DESC
     LIMIT 1000`,
    [uid(req), query, like, like, like]
  );
  res.json({ ok: true, customers: customerRows.map(customerView) });
}));

router.post("/", requireWriteAccess, asyncHandler(async (req, res) => {
  const customer = normalizeCustomer(req.body);
  if (!customer.customer_name) return res.status(400).json({ ok: false, error: "Customer name is required" });
  if (customer.customer_name.length > 255) return res.status(400).json({ ok: false, error: "Customer name is too long" });
  try {
    const result = await execute(
      pool,
      "INSERT INTO customers (user_id, customer_name, phone, notes) VALUES (?, ?, ?, ?)",
      [uid(req), customer.customer_name, customer.phone, customer.notes]
    );
    const created = await first(
      pool,
      "SELECT id, customer_name, phone, notes, created_at, updated_at FROM customers WHERE id=? AND user_id=? LIMIT 1",
      [result.insertId, uid(req)]
    );
    res.status(201).json({ ok: true, customer: customerView(created) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "A customer with this name already exists" });
    throw error;
  }
}));

router.post("/bulk", requireWriteAccess, asyncHandler(async (req, res) => {
  const input = Array.isArray(req.body?.customers) ? req.body.customers : [];
  if (!input.length) return res.status(400).json({ ok: false, error: "At least one customer is required" });
  if (input.length > 1000) return res.status(400).json({ ok: false, error: "A maximum of 1000 customers can be added at once" });

  const prepared = input.map(normalizeCustomer).filter((customer) => customer.customer_name);
  if (!prepared.length) return res.status(400).json({ ok: false, error: "No valid customer names were provided" });
  const duplicateNames = new Set();
  const unique = prepared.filter((customer) => {
    const key = customer.customer_name.toLocaleLowerCase();
    if (duplicateNames.has(key)) return false;
    duplicateNames.add(key);
    return true;
  });

  const result = await withTransaction(async (db) => {
    let createdCount = 0;
    const createdIds = [];
    for (const customer of unique) {
      const insert = await execute(
        db,
        "INSERT IGNORE INTO customers (user_id, customer_name, phone, notes) VALUES (?, ?, ?, ?)",
        [uid(req), customer.customer_name, customer.phone, customer.notes]
      );
      if (insert.affectedRows) {
        createdCount += 1;
        createdIds.push(Number(insert.insertId));
      }
    }
    return { createdCount, createdIds };
  });

  const createdRows = result.createdIds.length
    ? await rows(pool, `SELECT id, customer_name, phone, notes, created_at, updated_at FROM customers WHERE user_id=? AND id IN (${placeholders(result.createdIds)}) ORDER BY customer_name ASC`, [uid(req), ...result.createdIds])
    : [];
  res.status(201).json({
    ok: true,
    created_count: result.createdCount,
    skipped_count: input.length - result.createdCount,
    customers: createdRows.map(customerView),
  });
}));

router.patch("/:id", requireWriteAccess, asyncHandler(async (req, res) => {
  const id = int(req.params.id);
  const customer = normalizeCustomer(req.body);
  if (id <= 0 || !customer.customer_name) return res.status(400).json({ ok: false, error: "A valid id and customer name are required" });
  try {
    const result = await execute(
      pool,
      "UPDATE customers SET customer_name=?, phone=?, notes=? WHERE id=? AND user_id=?",
      [customer.customer_name, customer.phone, customer.notes, id, uid(req)]
    );
    if (!result.affectedRows) return res.status(404).json({ ok: false, error: "Customer not found" });
    const updated = await first(
      pool,
      "SELECT id, customer_name, phone, notes, created_at, updated_at FROM customers WHERE id=? AND user_id=? LIMIT 1",
      [id, uid(req)]
    );
    res.json({ ok: true, customer: customerView(updated) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, error: "A customer with this name already exists" });
    throw error;
  }
}));

router.delete("/:id", requireWriteAccess, asyncHandler(async (req, res) => {
  const id = int(req.params.id);
  if (id <= 0) return res.status(400).json({ ok: false, error: "A valid customer id is required" });
  const result = await execute(pool, "DELETE FROM customers WHERE id=? AND user_id=?", [id, uid(req)]);
  if (!result.affectedRows) return res.status(404).json({ ok: false, error: "Customer not found" });
  res.json({ ok: true, deleted: true });
}));

module.exports = router;
