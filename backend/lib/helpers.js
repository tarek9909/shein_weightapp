class HttpError extends Error {
  constructor(status, message, body = null) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const int = (value, fallback = 0) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};
const number = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
};
const finite = (value) => Number.isFinite(Number(value));
const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const trim = (value) => String(value ?? "").trim();
const nullableTrim = (value) => {
  const v = trim(value);
  return v === "" ? null : v;
};
const placeholders = (values) => values.map(() => "?").join(",");
const uniquePositiveInts = (values) => [...new Set((Array.isArray(values) ? values : []).map((v) => int(v)).filter((v) => v > 0))].sort((a, b) => a - b);
const jsonDecode = (value, fallback = null) => {
  if (value == null || value === "") return fallback;
  try { return typeof value === "string" ? JSON.parse(value) : value; } catch (_) { return fallback; }
};
const jsonEncode = (value) => JSON.stringify(value);
const paths = (name, root = false) => [`/${name}.php`, `/${name}`, ...(root ? ["/"] : [])];

async function first(db, sql, params = []) {
  const [rows] = await db.execute(sql, params);
  return rows[0] || null;
}

async function rows(db, sql, params = []) {
  const [result] = await db.execute(sql, params);
  return result;
}

async function execute(db, sql, params = []) {
  const [result] = await db.execute(sql, params);
  return result;
}

async function requireMonth(db, userId, monthId, status = 403) {
  const month = await first(db, "SELECT id, name FROM month WHERE id=? AND user_id=? LIMIT 1", [monthId, userId]);
  if (!month) throw new HttpError(status, status === 404 ? "Month not found" : "Invalid month for this user");
  return month;
}

async function requireOrder(db, userId, orderId) {
  const order = await first(db, "SELECT id, month_id, order_name FROM orders WHERE id=? AND user_id=? LIMIT 1", [orderId, userId]);
  if (!order) throw new HttpError(404, "Order not found");
  return order;
}

async function requireCart(db, userId, cartId) {
  const cart = await first(db, "SELECT * FROM order_carts WHERE id=? AND user_id=? LIMIT 1", [cartId, userId]);
  if (!cart) throw new HttpError(403, "Invalid cart for this user");
  return cart;
}

function errorBody(error) {
  if (error.body) return error.body;
  return { ok: false, error: error.message || "Server error" };
}

module.exports = {
  HttpError, asyncHandler, int, number, finite, round2, trim, nullableTrim,
  placeholders, uniquePositiveInts, jsonDecode, jsonEncode, paths, first, rows,
  execute, requireMonth, requireOrder, requireCart, errorBody,
};
