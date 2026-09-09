const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || process.env.DB_SERVER || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "shein",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD ?? "mysql",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  charset: "utf8mb4",
  timezone: "local",
  dateStrings: false,
});

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

module.exports = { pool, withTransaction };
