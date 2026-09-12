const path = require("path");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
const { pool } = require("../config/db");

const NODE_BASE = process.env.SMOKE_NODE_BASE_URL || "http://127.0.0.1:8081";
const PYTHON_BASE = process.env.SMOKE_PYTHON_BASE_URL || "http://127.0.0.1:8000";

async function request(base, route, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  const response = await fetch(`${base}${route}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return { response, body };
}

function assertStatus(result, expected, label) {
  if (result.response.status !== expected) throw new Error(`${label}: expected ${expected}, got ${result.response.status}`);
}

async function login(username, password) {
  const result = await request(NODE_BASE, "/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assertStatus(result, 200, `${username} login`);
  if (!result.body?.token) throw new Error(`${username} login did not return a token`);
  return result.body.token;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  const ready = await request(NODE_BASE, "/ready");
  assertStatus(ready, 200, "Node readiness");

  const dashboardToken = await login("dashboard_demo_1", "DashboardDemo1!");
  const operationsToken = await login("operations_demo_1", "OperationsDemo1!");
  const operationsToken2 = await login("operations_demo_2", "OperationsDemo2!");
  let createdMonthId = 0;
  let smokeAdminId = 0;
  let managedUserId = 0;
  let managedToken = "";
  let smokeSheinApiEmail = "";

  try {
    const dashboardWrite = await request(NODE_BASE, "/month/addMonth", {
      method: "POST", headers: { ...auth(dashboardToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name: `should-not-write-${Date.now()}` }),
    });
    assertStatus(dashboardWrite, 403, "Dashboard write protection");

    const managedUsers = await request(NODE_BASE, "/auth/users", { headers: auth(operationsToken) });
    assertStatus(managedUsers, 403, "Operations account-management protection");

    const addMonth = await request(NODE_BASE, "/month/addMonth", {
      method: "POST", headers: { ...auth(operationsToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name: `smoke-${Date.now()}` }),
    });
    assertStatus(addMonth, 200, "Operations month creation");
    createdMonthId = Number(addMonth.body?.id || 0);
    if (!createdMonthId) throw new Error("Operations month creation did not return an id");

    const smokeOrder = await request(NODE_BASE, "/orders/addOrder", {
      method: "POST", headers: { ...auth(operationsToken), "Content-Type": "application/json" },
      body: JSON.stringify({ month_id: createdMonthId, order_name: "smoke-order", order_details: "10", amount_to_collect: 10 }),
    });
    assertStatus(smokeOrder, 200, "Smoke order creation");
    const smokeCart = await request(NODE_BASE, "/ordersDetails/addCart", {
      method: "POST", headers: { ...auth(operationsToken), "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: smokeOrder.body?.id, cart_order_number: "smoke-cart", cart_price: 10 }),
    });
    assertStatus(smokeCart, 200, "Smoke cart creation");
    const smokeCustomer = await request(NODE_BASE, "/ordersDetails/addCustomer", {
      method: "POST", headers: { ...auth(operationsToken), "Content-Type": "application/json" },
      body: JSON.stringify({ cart_id: smokeCart.body?.id, customer_name: "smoke-customer", usd_to_collect: 10, delivery_charge_usd: 0 }),
    });
    assertStatus(smokeCustomer, 200, "Smoke customer creation");

    const otherUserMonths = await request(NODE_BASE, "/month/getMonths", { headers: auth(operationsToken2) });
    assertStatus(otherUserMonths, 200, "Second-user month listing");
    if (Array.isArray(otherUserMonths.body) && otherUserMonths.body.some((month) => Number(month.id) === createdMonthId)) {
      throw new Error("Second operations user can see the first user's month");
    }

    const invalidBudget = await request(NODE_BASE, "/budget/addBudget", {
      method: "POST", headers: { ...auth(operationsToken), "Content-Type": "application/json" },
      body: JSON.stringify({ month_id: createdMonthId, value: "not-a-number" }),
    });
    assertStatus(invalidBudget, 400, "Invalid numeric input rejection");

    const reports = await request(NODE_BASE, "/reports/summary", { headers: auth(operationsToken) });
    assertStatus(reports, 200, "Operations reports route");

    const accounts = await request(NODE_BASE, "/sheinAccounts/getAccounts", { headers: auth(operationsToken) });
    assertStatus(accounts, 200, "SHEIN account listing");
    if (/shein_password|gmail_app_password|cookies_json/i.test(JSON.stringify(accounts.body))) {
      throw new Error("SHEIN account response contains a secret field");
    }

    smokeSheinApiEmail = `smoke-shein-${Date.now()}@example.com`;
    const manualOnlyAccount = await request(NODE_BASE, "/sheinAccounts/saveAccount", {
      method: "POST", headers: { ...auth(operationsToken), "Content-Type": "application/json" },
      body: JSON.stringify({ email: smokeSheinApiEmail, shein_email: smokeSheinApiEmail, profile_key: "auto" }),
    });
    assertStatus(manualOnlyAccount, 201, "Manual-only SHEIN account without Gmail");
    const removeManualOnly = await request(NODE_BASE, "/sheinAccounts/deleteAccount", {
      method: "POST", headers: { ...auth(operationsToken), "Content-Type": "application/json" },
      body: JSON.stringify({ email: smokeSheinApiEmail }),
    });
    assertStatus(removeManualOnly, 200, "Manual-only SHEIN account cleanup");
    await pool.execute("DELETE FROM shein_profile_reservations WHERE account_email=?", [smokeSheinApiEmail]);
    smokeSheinApiEmail = "";

    const forged = jwt.sign({ user_id: 1, role: "admin" }, "CHANGE_THIS_SECRET_123", { algorithm: "HS256" });
    const oldSecret = await request(NODE_BASE, "/month/getMonths", { headers: { Authorization: `Bearer ${forged}` } });
    assertStatus(oldSecret, 401, "Old default JWT rejection");

    const smokeAdminUsername = `smoke_admin_${Date.now()}`;
    const smokeAdminPassword = "SmokeAdminPassword!123";
    const [adminInsert] = await pool.execute("INSERT INTO users (username,password_hash,role,is_active,auth_version) VALUES (?,?,'admin',1,0)", [smokeAdminUsername, await bcrypt.hash(smokeAdminPassword, 12)]);
    smokeAdminId = Number(adminInsert.insertId);
    const adminToken = await login(smokeAdminUsername, smokeAdminPassword);
    const managedUsername = `smoke_managed_${Date.now()}`;
    const managedPassword = "SmokeManagedPassword!123";
    const createManaged = await request(NODE_BASE, "/auth/users", {
      method: "POST", headers: { ...auth(adminToken), "Content-Type": "application/json" },
      body: JSON.stringify({ username: managedUsername, password: managedPassword, role: "dashboard" }),
    });
    assertStatus(createManaged, 201, "Managed account creation");
    managedUserId = Number(createManaged.body?.user?.id || 0);
    if (!managedUserId) throw new Error("Managed account creation did not return an id");
    managedToken = await login(managedUsername, managedPassword);
    const disableManaged = await request(NODE_BASE, "/auth/disableUser", {
      method: "POST", headers: { ...auth(adminToken), "Content-Type": "application/json" },
      body: JSON.stringify({ id: managedUserId, is_active: false }),
    });
    assertStatus(disableManaged, 200, "Managed account disable");
    const disabledToken = await request(NODE_BASE, "/month/getMonths", { headers: auth(managedToken) });
    assertStatus(disabledToken, 401, "Disabled account token invalidation");
    const enableManaged = await request(NODE_BASE, "/auth/disableUser", {
      method: "POST", headers: { ...auth(adminToken), "Content-Type": "application/json" },
      body: JSON.stringify({ id: managedUserId, is_active: true }),
    });
    assertStatus(enableManaged, 200, "Managed account enable");
    const resetManaged = await request(NODE_BASE, "/auth/resetUserPassword", {
      method: "POST", headers: { ...auth(adminToken), "Content-Type": "application/json" },
      body: JSON.stringify({ id: managedUserId, password: "SmokeManagedPassword!456" }),
    });
    assertStatus(resetManaged, 200, "Managed account password reset");
    const revokedToken = await request(NODE_BASE, "/month/getMonths", { headers: auth(managedToken) });
    assertStatus(revokedToken, 401, "Password reset token invalidation");
    const reauthenticated = await login(managedUsername, "SmokeManagedPassword!456");
    const roleUpdate = await request(NODE_BASE, "/auth/updateUser", {
      method: "POST", headers: { ...auth(adminToken), "Content-Type": "application/json" },
      body: JSON.stringify({ id: managedUserId, role: "operations" }),
    });
    assertStatus(roleUpdate, 200, "Managed account role update");
    const deleteManaged = await request(NODE_BASE, `/auth/users/${managedUserId}`, {
      method: "DELETE", headers: auth(adminToken),
    });
    assertStatus(deleteManaged, 200, "Managed account soft delete");
    const deletedLogin = await request(NODE_BASE, "/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: managedUsername, password: "SmokeManagedPassword!456" }),
    });
    assertStatus(deletedLogin, 401, "Soft-deleted account login rejection");

    const metrics = await request(NODE_BASE, "/metrics");
    assertStatus(metrics, 200, "Metrics route");
    if (!metrics.body?.metrics || Number(metrics.body.metrics.requests) < 1) throw new Error("Metrics did not record requests");

    const pythonWithoutToken = await request(PYTHON_BASE, "/api/users");
    assertStatus(pythonWithoutToken, 401, "Python internal-token protection");
    const internalToken = String(process.env.SHEIN_LOCAL_API_TOKEN || process.env.INTERNAL_API_TOKEN || "");
    if (internalToken.length < 32) throw new Error("Smoke test cannot verify Python API: internal token is missing");
    const pythonWithToken = await request(PYTHON_BASE, "/api/users", { headers: { "X-Internal-Token": internalToken } });
    assertStatus(pythonWithToken, 200, "Python persistence route");

    console.log("Backend smoke tests passed");
  } finally {
    if (createdMonthId) {
      await request(NODE_BASE, "/month/deleteMonth", {
        method: "POST", headers: { ...auth(operationsToken), "Content-Type": "application/json" },
        body: JSON.stringify({ id: createdMonthId }),
      }).catch(() => {});
    }
    if (managedUserId) await pool.execute("DELETE FROM users WHERE id=?", [managedUserId]).catch(() => {});
    if (smokeAdminId) await pool.execute("DELETE FROM users WHERE id=?", [smokeAdminId]).catch(() => {});
    if (smokeSheinApiEmail) {
      await pool.execute("DELETE FROM shein_accounts WHERE api_email=?", [smokeSheinApiEmail]).catch(() => {});
      await pool.execute("DELETE FROM shein_profile_reservations WHERE account_email=?", [smokeSheinApiEmail]).catch(() => {});
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Backend smoke tests failed: ${error.message}`);
  process.exitCode = 1;
});
