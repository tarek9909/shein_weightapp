const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");
const { seal, assertSecretConfig } = require("../lib/secretBox");

const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.DB_SERVER || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "shein",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: "utf8mb4",
  timezone: "local",
  dateStrings: false,
});

async function hasColumn(table, column) {
  const [rows] = await pool.execute(
    "SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1",
    [table, column]
  );
  return Boolean(rows[0]);
}

async function addColumnIfMissing(table, column, definition) {
  if (!(await hasColumn(table, column))) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
}

function migrationStatements(source) {
  return source
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runMigrations() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(255) NOT NULL PRIMARY KEY,
    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  const directory = path.join(__dirname, "..", "migrations");
  const files = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()
    : [];
  for (const version of files) {
    const [appliedRows] = await pool.execute("SELECT version FROM schema_migrations WHERE version=? LIMIT 1", [version]);
    if (appliedRows[0]) continue;
    const sql = fs.readFileSync(path.join(directory, version), "utf8");
    for (const statement of migrationStatements(sql)) await pool.query(statement);
    await pool.execute("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
  }
}

async function ensureRuntimeSchema() {
  await pool.query("SELECT 1");
  await runMigrations();
  await addColumnIfMissing("users", "role", "ENUM('admin','dashboard','operations') NOT NULL DEFAULT 'admin'");
  await addColumnIfMissing("users", "owner_user_id", "INT NULL");
  await addColumnIfMissing("users", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");
  await addColumnIfMissing("users", "auth_version", "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing("users", "last_login_at", "DATETIME NULL");
  await addColumnIfMissing("order_carts", "chrome_profile_key", "VARCHAR(255) NULL");
  await addColumnIfMissing("orders", "profit_put_aside", "DECIMAL(10,2) NULL");
  await addColumnIfMissing("orders", "profit_put_aside_at", "DATETIME NULL");
  await addColumnIfMissing("shein_accounts", "shein_password_enc", "TEXT NULL");
  await addColumnIfMissing("shein_accounts", "gmail_app_password_enc", "TEXT NULL");
  await addColumnIfMissing("shein_accounts", "storage_state_enc", "MEDIUMTEXT NULL");
  await addColumnIfMissing("shein_accounts", "profile_key", "VARCHAR(100) NULL");
  await pool.query(`CREATE TABLE IF NOT EXISTS shein_profile_reservations (
    profile_key VARCHAR(100) NOT NULL PRIMARY KEY,
    user_id INT NULL,
    account_email VARCHAR(255) NULL,
    reserved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);
  await ensureSheinProfileAssignments();
  assertSecretConfig();
  const legacyColumns = ["shein_password", "gmail_app_password", "cookies_json"];
  const availableLegacyColumns = [];
  for (const column of legacyColumns) {
    if (await hasColumn("shein_accounts", column)) availableLegacyColumns.push(column);
  }
  if (availableLegacyColumns.length) {
    const condition = availableLegacyColumns.map((column) => `\`${column}\` IS NOT NULL`).join(" OR ");
    const [legacyAccounts] = await pool.query(`SELECT id, ${availableLegacyColumns.map((column) => `\`${column}\``).join(", ")} FROM shein_accounts WHERE ${condition}`);
    for (const account of legacyAccounts) {
      const updates = [];
      const values = [];
      const migrations = [
        ["shein_password", "shein_password_enc"],
        ["gmail_app_password", "gmail_app_password_enc"],
        ["cookies_json", "storage_state_enc"],
      ];
      for (const [legacyColumn, encryptedColumn] of migrations) {
        if (account[legacyColumn] != null) {
          updates.push(`\`${encryptedColumn}\`=?`, `\`${legacyColumn}\`=NULL`);
          values.push(seal(account[legacyColumn]));
        }
      }
      if (updates.length) await pool.execute(`UPDATE shein_accounts SET ${updates.join(", ")} WHERE id=?`, [...values, account.id]);
    }
  }
  if (process.env.SEED_ADMIN !== "0") {
    await pool.execute("INSERT IGNORE INTO users (username,password_hash,role,is_active,auth_version) VALUES ('admin', '$2a$12$G/2jPhENlIPVzQ1MV18yYesjR9RWEr8nMGCloC20H2uI1JQhqB5HW', 'admin', 1, 0)");
  }
  if (process.env.NODE_ENV !== "production" && process.env.SEED_DEMO_ACCOUNTS !== "0") {
    const demoUsers = [
      ["dashboard_demo_1", "$2a$10$CTirYvWumwd9zJT3BVTxuuKllgl.v.bwzlHgs6Z1342hB7iHic8oe", "dashboard"],
      ["dashboard_demo_2", "$2a$10$dZy6ntjV8f/KhmDvvHA9iul4RsOCNBjz/hZ0comNQ5Ym5lEJ3hqIy", "dashboard"],
      ["operations_demo_1", "$2a$10$HSWQhjPtUdzkZGtGrNm8Z.WfmlaUwBYXPcp3WVINYQxw04VORHnJK", "operations"],
      ["operations_demo_2", "$2a$10$3pCG7t5nX/S3.f8JzooRMOQYnQOj.Zc5lb3o4anOMblGgrNrQDmhG", "operations"],
    ];
    for (const [username, passwordHash, role] of demoUsers) {
      await pool.execute("INSERT IGNORE INTO users (username,password_hash,role,owner_user_id,is_active,auth_version) SELECT ?,?,?,id,1,0 FROM users WHERE username='admin' LIMIT 1", [username, passwordHash, role]);
    }
  }
}

async function ensureSheinProfileAssignments() {
  const [accounts] = await pool.query("SELECT id,profile_key FROM shein_accounts ORDER BY id ASC");
  const [reservations] = await pool.query("SELECT profile_key FROM shein_profile_reservations");
  const used = new Set();
  for (const reservation of reservations) {
    const profile = String(reservation.profile_key || "").trim();
    if (profile) used.add(profile.toLowerCase());
  }
  let nextIndex = 0;
  const allocate = () => {
    while (true) {
      const candidate = nextIndex === 0 ? "Default" : `Profile ${nextIndex}`;
      nextIndex += 1;
      if (!used.has(candidate.toLowerCase())) return candidate;
    }
  };

  for (const account of accounts) {
    const stored = String(account.profile_key || "");
    const original = stored.trim();
    let profile = original.toLowerCase() === "default"
      ? "Default"
      : (/^profile \d+$/i.test(original) ? `Profile ${Number(original.slice(8))}` : original);
    if (!profile || used.has(profile.toLowerCase())) profile = allocate();
    used.add(profile.toLowerCase());
    if (profile !== stored) {
      await pool.execute("UPDATE shein_accounts SET profile_key=? WHERE id=?", [profile, account.id]);
      console.log(`[SHEIN] Assigned browser profile ${profile} to account ${account.id}`);
    }
  }

  const [indexes] = await pool.query(
    "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='shein_accounts' AND INDEX_NAME='uq_shein_accounts_profile_key' LIMIT 1",
  );
  if (!indexes[0]) {
    await pool.query("ALTER TABLE shein_accounts ADD UNIQUE KEY uq_shein_accounts_profile_key (profile_key)");
  }
}

async function checkDatabase() {
  await pool.query("SELECT 1");
  return true;
}

async function checkTenantIntegrity() {
  const checks = [
    ["managed account has an invalid owner", "SELECT 1 FROM users u LEFT JOIN users owner ON owner.id=u.owner_user_id WHERE u.owner_user_id IS NOT NULL AND (owner.id IS NULL OR u.owner_user_id=u.id OR owner.role<>'admin') LIMIT 1"],
    ["orders reference a month owned by another user", "SELECT 1 FROM orders o JOIN month m ON m.id=o.month_id WHERE o.user_id<>m.user_id LIMIT 1"],
    ["carts reference an order owned by another user", "SELECT 1 FROM order_carts c JOIN orders o ON o.id=c.order_id WHERE c.user_id<>o.user_id LIMIT 1"],
    ["customers reference a cart owned by another user", "SELECT 1 FROM cart_customers c JOIN order_carts o ON o.id=c.cart_id WHERE c.user_id<>o.user_id LIMIT 1"],
    ["carts reference a SHEIN account owned by another user", "SELECT 1 FROM order_carts c LEFT JOIN shein_accounts a ON a.id=c.shein_account_id WHERE c.shein_account_id IS NOT NULL AND (a.id IS NULL OR a.user_id<>c.user_id) LIMIT 1"],
    ["budgets reference a month owned by another user", "SELECT 1 FROM budget b JOIN month m ON m.id=b.month_id WHERE b.user_id<>m.user_id LIMIT 1"],
    ["customs entries reference a month owned by another user", "SELECT 1 FROM customs c JOIN month m ON m.id=c.month_id WHERE c.user_id<>m.user_id LIMIT 1"],
    ["losses reference a month owned by another user", "SELECT 1 FROM delivery_losses l JOIN month m ON m.id=l.month_id WHERE l.user_id<>m.user_id LIMIT 1"],
    ["debts reference a month owned by another user", "SELECT 1 FROM customer_debts d JOIN month m ON m.id=d.month_id WHERE d.user_id<>m.user_id LIMIT 1"],
    ["payments reference a month owned by another user", "SELECT 1 FROM payments p JOIN month m ON m.id=p.month_id WHERE p.user_id<>m.user_id LIMIT 1"],
    ["shipment receipts reference an order owned by another user", "SELECT 1 FROM shipment_receipts r LEFT JOIN orders o ON o.id=r.order_id WHERE o.id IS NULL OR r.user_id<>o.user_id LIMIT 1"],
    ["SHEIN accounts reference a missing user", "SELECT 1 FROM shein_accounts a LEFT JOIN users u ON u.id=a.user_id WHERE u.id IS NULL LIMIT 1"],
  ];
  for (const [description, sql] of checks) {
    const [rows] = await pool.query(sql);
    if (rows[0]) throw new Error(`Tenant integrity check failed: ${description}`);
  }
  return true;
}

async function withTransaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const value = await work(connection);
    await connection.commit();
    return value;
  } catch (error) {
    try { await connection.rollback(); } catch (_) { /* preserve original error */ }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { pool, withTransaction, checkDatabase, checkTenantIntegrity, ensureRuntimeSchema, runMigrations };
