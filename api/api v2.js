const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const { chromium } = require("playwright");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");

dotenv.config({ path: path.join(__dirname, ".env") });

const APP_SECRET = process.env.APP_SECRET;
if (!APP_SECRET) throw new Error("APP_SECRET missing in .env");

const DB_URL = process.env.DB_URL;
if (!DB_URL) throw new Error("DB_URL missing in .env");

const DEFAULT_BASE_URL = process.env.SHEIN_BASE_URL || "https://ar.shein.com";
const PLAYWRIGHT_HEADLESS = ["0", "true", "yes"].includes(
  String(process.env.PLAYWRIGHT_HEADLESS || "1").trim().toLowerCase()
);``
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8000);
const PROFILES_DIR = path.join(__dirname, "profiles");
const DEBUG_DIR = path.join(__dirname, "debug");

fs.mkdirSync(PROFILES_DIR, { recursive: true });
fs.mkdirSync(DEBUG_DIR, { recursive: true });

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

function normalizeEmail(value) {
  let v = String(value || "").trim().toLowerCase();
  if (v.includes("@")) {
    const [local, domain] = v.split("@", 2);
    if (local && domain && !domain.includes(".")) v = `${local}@${domain}.com`;
  }
  return v;
}

function parseMySqlUrl(dbUrl) {
  const normalized = dbUrl.replace(/^mysql\+pymysql:\/\//, "mysql://");
  const url = new URL(normalized);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
  };
}

const pool = mysql.createPool(parseMySqlUrl(DB_URL));

function base64UrlEncode(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  return Buffer.from(normalized + (padding ? "=".repeat(4 - padding) : ""), "base64");
}

function getFernetKeys(appSecret) {
  const digest = crypto.createHash("sha256").update(appSecret, "utf8").digest();
  return {
    signingKey: digest.subarray(0, 16),
    encryptionKey: digest.subarray(16, 32),
  };
}

function encryptStr(appSecret, plaintext) {
  const { signingKey, encryptionKey } = getFernetKeys(appSecret);
  const version = Buffer.from([0x80]);
  const ts = Buffer.alloc(8);
  ts.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)));
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const payload = Buffer.concat([version, ts, iv, ciphertext]);
  const mac = crypto.createHmac("sha256", signingKey).update(payload).digest();
  return base64UrlEncode(Buffer.concat([payload, mac]));
}

function decryptStr(appSecret, token) {
  const raw = base64UrlDecode(token);
  if (raw.length < 57) throw new Error("Invalid token");

  const { signingKey, encryptionKey } = getFernetKeys(appSecret);
  const payload = raw.subarray(0, raw.length - 32);
  const actualMac = raw.subarray(raw.length - 32);
  const expectedMac = crypto.createHmac("sha256", signingKey).update(payload).digest();
  if (!crypto.timingSafeEqual(actualMac, expectedMac)) throw new Error("Invalid token signature");
  if (payload[0] !== 0x80) throw new Error("Unsupported token version");

  const iv = payload.subarray(9, 25);
  const ciphertext = payload.subarray(25);
  const decipher = crypto.createDecipheriv("aes-128-cbc", encryptionKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function ensureTables() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS shein_api_users (
        id INT NOT NULL AUTO_INCREMENT,
        owner_user_id INT NULL,
        email VARCHAR(255) NOT NULL,
        gmail_email VARCHAR(255) NOT NULL,
        gmail_app_password_enc TEXT NOT NULL,
        shein_email VARCHAR(255) NOT NULL,
        shein_password_enc TEXT NOT NULL,
        shein_storage_state_enc TEXT NULL,
        PRIMARY KEY (id),
        KEY ix_shein_api_users_owner_user_id (owner_user_id),
        KEY ix_shein_api_users_email (email),
        UNIQUE KEY uq_shein_owner_email (owner_user_id, email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `,
    `
      CREATE TABLE IF NOT EXISTS shein_api_orders (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        order_no VARCHAR(64) NOT NULL,
        carrier VARCHAR(64) NULL,
        tracking_no VARCHAR(64) NULL,
        status_text VARCHAR(255) NULL,
        delivered TINYINT(1) DEFAULT 0,
        last_details TEXT NULL,
        last_timestamp VARCHAR(64) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_user_order (user_id, order_no),
        CONSTRAINT fk_shein_api_orders_user FOREIGN KEY (user_id) REFERENCES shein_api_users (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `,
  ];

  for (const sql of statements) await pool.query(sql);
}

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

function withOwnerFilter(sql, ownerUserId) {
  return ownerUserId !== null && ownerUserId !== undefined ? `${sql} AND owner_user_id = ?` : sql;
}

async function loadUserAndCreds(email) {
  const user = await getOne("SELECT * FROM shein_api_users WHERE email = ? LIMIT 1", [email]);
  if (!user) throw new HttpError(404, "User not found. Register first.");
  if (!user.shein_email || !user.shein_password_enc) throw new HttpError(400, "Missing SHEIN credentials. Register again.");
  if (!user.gmail_email || !user.gmail_app_password_enc) throw new HttpError(400, "Missing Gmail credentials. Register again.");

  try {
    return {
      user,
      profileKey: `user_${user.id}`,
      sheinEmail: normalizeEmail(user.shein_email),
      sheinPassword: decryptStr(APP_SECRET, user.shein_password_enc),
      gmailEmail: normalizeEmail(user.gmail_email),
      gmailAppPassword: decryptStr(APP_SECRET, user.gmail_app_password_enc),
    };
  } catch (error) {
    throw new HttpError(400, `Failed to decrypt credentials: ${error.name}`);
  }
}

async function requireOrderBelongsToUser(userId, orderNo) {
  const order = await getOne("SELECT * FROM shein_api_orders WHERE user_id = ? AND order_no = ? LIMIT 1", [
    userId,
    orderNo,
  ]);
  if (!order) throw new HttpError(404, "Order not found for this user. Add it first.");
  return order;
}

const SHEIN_FROM_HINTS = ["shein", "sheinnotice.com", "noreply@sheinnotice.com"];
const KEYWORDS = ["code", "verify", "verification", "enter the following", "رمز", "التحقق", "رمز التحقق", "للأمان"];

function isJunkCode(code) {
  return new Set(String(code)).size === 1;
}

function pickBestCode(body) {
  const matches = Array.from(String(body || "").matchAll(/\b(\d{5,6})\b/g));
  if (!matches.length) return null;

  const lower = String(body || "").toLowerCase();
  let best = null;
  let bestScore = -1;

  for (const match of matches) {
    const code = match[1];
    if (isJunkCode(code)) continue;

    const start = Math.max(0, match.index - 100);
    const end = Math.min(lower.length, match.index + code.length + 100);
    const window = lower.slice(start, end);
    let score = code.length === 6 ? 1 : 0;

    for (const keyword of KEYWORDS) {
      if (window.includes(String(keyword).toLowerCase())) score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  }

  if (best) return best;
  for (const match of [...matches].reverse()) {
    const code = match[1];
    if (!isJunkCode(code)) return code;
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getLatestSheinCode(gmailEmail, gmailAppPassword, timeoutSec = 180) {
  const deadline = Date.now() + timeoutSec * 1000;
  console.log(`[DEBUG] Polling Gmail for SHEIN code: ${gmailEmail}`);

  while (Date.now() < deadline) {
    const client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: gmailEmail,
        pass: gmailAppPassword,
      },
    });

    try {
      await client.connect();
      await client.mailboxOpen("INBOX");

      let ids = await client.search({ seen: false });
      if (!ids.length) ids = await client.search({});
      ids = ids.sort((a, b) => a - b).slice(-60).reverse();
      console.log(`[DEBUG] Gmail candidate messages: ${ids.length}`);

      for (const id of ids) {
        for await (const message of client.fetch(String(id), { source: true }, { uid: true })) {
          const parsed = await simpleParser(message.source);
          const fromText = String(parsed.from?.text || "").toLowerCase();
          const subject = String(parsed.subject || "").toLowerCase();
          if (!SHEIN_FROM_HINTS.some((hint) => fromText.includes(hint)) && !subject.includes("shein")) {
            continue;
          }

          const body = `${parsed.text || ""}\n${parsed.html || ""}`;
          const code = pickBestCode(body);
          if (code) {
            await client.logout();
            return code;
          }
        }
      }
    } catch (error) {
      console.log(`[DEBUG] Gmail polling error: ${error.name}: ${error.message}`);
      if (error.authenticationFailed || /auth/i.test(error.message || "")) {
        try {
          await client.logout();
        } catch (_) {
          // ignore
        }
        throw new Error(
          "Gmail IMAP login failed. Check Gmail address/app password and make sure IMAP is enabled."
        );
      }
    } finally {
      try {
        if (client.usable) await client.logout();
      } catch (_) {
        // ignore
      }
    }

    await sleep(5000);
  }

  return null;
}

function extractSsrBlock(html) {
  if (!html) return null;

  const patterns = [
    /window\.gbOrdersTrackSsrData\s*=\s*(\{.*?\})\s*;<\/script>/s,
    /\bgbOrdersTrackSsrData\s*=\s*(\{.*?\})\s*;<\/script>/s,
    /window\[['"]gbOrdersTrackSsrData['"]\]\s*=\s*(\{.*?\})\s*;<\/script>/s,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }

  const idx = html.indexOf("gbOrdersTrackSsrData");
  if (idx === -1) return null;
  const start = html.indexOf("{", idx);
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }

  return null;
}

function jsonParseSsr(ssrText) {
  if (!ssrText) return null;

  try {
    return JSON.parse(ssrText);
  } catch (_) {
    // ignore
  }

  let fixed = ssrText.replace(/,\s*([}\]])/g, "$1").replace(/\bundefined\b/g, "null");
  if (fixed.includes("'") && !fixed.includes('"')) fixed = fixed.replace(/'/g, '"');

  try {
    return JSON.parse(fixed);
  } catch (_) {
    return null;
  }
}

function pullPkgFromJson(ssrJson) {
  function deepFind(obj, depth = 0) {
    if (!obj || depth > 7) return null;

    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = deepFind(item, depth + 1);
        if (found) return found;
      }
      return null;
    }

    if (typeof obj !== "object") return null;

    if (
      "track_num" in obj ||
      "logistics_tracks_list" in obj ||
      "carrier_name" in obj ||
      "track_url" in obj
    ) {
      if (Array.isArray(obj.logistics_tracks_list) || "track_num" in obj) return obj;
    }

    for (const value of Object.values(obj)) {
      const found = deepFind(value, depth + 1);
      if (found) return found;
    }
    return null;
  }

  return deepFind(ssrJson);
}

function regexValue(ssrText, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(ssrText || "").match(new RegExp(`"${escaped}"\\s*:\\s*"([^"]+)"`));
  return match ? match[1] : null;
}

function regexFirstDetails(ssrText) {
  const match = String(ssrText || "").match(/"details"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function regexFirstTimestamp(ssrText) {
  const match = String(ssrText || "").match(/"timestamp"\s*:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function cleanToken(value) {
  return String(value || "").trim();
}

function detectSplitFromText(text) {
  if (!text) return null;

  const low = String(text).toLowerCase();
  const patterns = [
    /(?:in|into)\s+(\d+)\s+(?:separate\s+)?(?:packages?|parcels?)/i,
    /(\d+)\s+(?:separate\s+)?(?:packages?|parcels?)/i,
    /(\d+)\s*(?:حزم|حزمة)/i,
    /(\d+)\s*包裹/i,
  ];

  for (const pattern of patterns) {
    const match = low.match(pattern);
    if (match) {
      const count = Number(match[1]);
      if (count >= 2) return count;
    }
  }

  if (["separate packages", "split package", "split shipment", "حزم منفصلة", "包裹"].some((token) => low.includes(token))) {
    return 2;
  }
  return null;
}

function collectSplitInfo(ssrJson, ssrText, pkg) {
  const trackingNos = new Set();
  const packageRefs = new Set();
  let explicitCount = null;

  if (pkg && typeof pkg === "object") {
    const trackNum = cleanToken(pkg.track_num);
    if (trackNum) trackingNos.add(trackNum);
    const packageNo = cleanToken(pkg.package_no);
    if (packageNo) packageRefs.add(packageNo);
    for (const entry of pkg.logistics_tracks_list || []) {
      if (entry && typeof entry === "object") {
        const count = detectSplitFromText(entry.details || "");
        if (count && (explicitCount === null || count > explicitCount)) explicitCount = count;
      }
    }
  }

  function walk(obj, depth = 0) {
    if (!obj || depth > 9) return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, depth + 1);
      return;
    }
    if (typeof obj !== "object") return;

    for (const [key, value] of Object.entries(obj)) {
      if (key === "shipping_no" || key === "track_num") {
        const token = cleanToken(value);
        if (token) trackingNos.add(token);
      } else if (key === "package_no" || key === "reference_number") {
        const token = cleanToken(value);
        if (token) packageRefs.add(token);
      } else if (key === "details") {
        const count = detectSplitFromText(value || "");
        if (count && (explicitCount === null || count > explicitCount)) explicitCount = count;
      }
      walk(value, depth + 1);
    }
  }

  if (ssrJson && typeof ssrJson === "object") walk(ssrJson);
  if (ssrText) {
    const count = detectSplitFromText(ssrText);
    if (count && (explicitCount === null || count > explicitCount)) explicitCount = count;
  }

  const countByData = Math.max(trackingNos.size, packageRefs.size);
  const splitCount = explicitCount || countByData;
  return {
    is_split: Boolean(splitCount && splitCount >= 2),
    split_count: splitCount ? Number(splitCount) : 0,
    all_tracking_numbers: [...trackingNos].sort(),
    all_package_refs: [...packageRefs].sort(),
  };
}

function toFloat(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value) {
  const parsed = Number.parseInt(Number(value), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findItemsList(ssrJson) {
  if (!ssrJson || typeof ssrJson !== "object") return [];

  const paths = [
    ["data", "order_goods_list"],
    ["data", "orderGoodsList"],
    ["data", "goods_list"],
    ["data", "goodsList"],
    ["data", "order_detail", "order_goods_list"],
    ["data", "orderDetail", "orderGoodsList"],
    ["props", "pageProps", "data", "order_goods_list"],
    ["props", "pageProps", "data", "orderGoodsList"],
  ];

  function getPath(obj, keys) {
    let current = obj;
    for (const key of keys) {
      if (!current || typeof current !== "object" || !(key in current)) return null;
      current = current[key];
    }
    return current;
  }

  for (const keys of paths) {
    const value = getPath(ssrJson, keys);
    if (Array.isArray(value) && value.length && typeof value[0] === "object") {
      if ("weight" in value[0] || "quantity" in value[0]) return value;
    }
  }

  function deepFind(obj, depth = 0) {
    if (!obj || depth > 7) return null;
    if (Array.isArray(obj)) {
      if (obj.length && typeof obj[0] === "object" && ("weight" in obj[0] || "quantity" in obj[0])) {
        return obj;
      }
      for (const item of obj) {
        const found = deepFind(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof obj !== "object") return null;
    for (const value of Object.values(obj)) {
      const found = deepFind(value, depth + 1);
      if (found) return found;
    }
    return null;
  }

  return deepFind(ssrJson) || [];
}

function computeTotalWeight(ssrJson) {
  const items = findItemsList(ssrJson);
  let totalG = 0;
  let counted = 0;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const weight = toFloat(item.weight);
    const quantity = toInt(item.quantity || 1);
    if (weight <= 0 || quantity <= 0) continue;
    totalG += weight * quantity;
    counted += 1;
  }

  const totalWeightG = Math.round(totalG);
  return {
    total_weight_g: totalWeightG,
    total_weight_kg: Math.round((totalWeightG / 1000) * 1000) / 1000,
    items_counted: counted,
  };
}

function isDeliveredFromLastEvent(last) {
  const status = String(last?.status || "").trim();
  const mallStatus = String(last?.mall_status || "").trim();
  const code = String(last?.mall_status_code || "").trim();
  const detailStatus = String(last?.detail_status || "").trim();
  const details = String(last?.details || "").trim();
  const dlow = details.toLowerCase();
  const slow = status.toLowerCase();

  return (
    detailStatus === "7" &&
    (code === "6" ||
      status.includes("签收") ||
      mallStatus.includes("签收") ||
      slow.includes("delivered") ||
      dlow.includes("delivered") ||
      details.includes("تم التسليم") ||
      details.includes("تم تسليم") ||
      details.includes("يتم تسليم طلبك"))
  );
}

async function ensureLoggedIn(page, baseUrl, acc, fetchUrl = null, headless = false) {
  await page.goto(`${baseUrl}/user/login`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("load", { timeout: 15000 });
  } catch (_) {
    // ignore
  }
  await page.waitForTimeout(1000);

  if (!page.url().toLowerCase().includes("login")) return;

  let emailInput = page.locator("input#continue-alias-input").first();
  try {
    await emailInput.waitFor({ state: "visible", timeout: 30000 });
  } catch (_) {
    if (!(await emailInput.isVisible().catch(() => false))) {
      emailInput = page
        .locator('input#continue-alias-input, input[aria-label*="البريد"], input[type="text"]')
        .first();
      try {
        await emailInput.waitFor({ state: "visible", timeout: 15000 });
      } catch (error) {
        await page.screenshot({ path: path.join(DEBUG_DIR, "debug_email_input_timeout.png"), fullPage: true });
        throw error;
      }
    }
  }

  try {
    await page.waitForLoadState("load", { timeout: 10000 });
  } catch (_) {
    // ignore
  }
  await emailInput.click();
  await emailInput.press("Control+A");
  await emailInput.type(acc.sheinEmail, { delay: 40 });

  try {
    const currentValue = await emailInput.inputValue();
    if (currentValue.trim() !== acc.sheinEmail) {
      await emailInput.evaluate(
        (el, value) => {
          el.value = value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        acc.sheinEmail
      );
    }
  } catch (_) {
    // ignore
  }

  let cont = page.locator("button.page__login_mainButton:has-text('متابعة')").first();
  if ((await cont.count()) === 0) cont = page.locator("button:has-text('متابعة')").first();
  await cont.waitFor({ state: "visible", timeout: 10000 });
  await cont.click();

  if (headless) {
    try {
      await page.screenshot({ path: path.join(DEBUG_DIR, "after_continue_headless.png"), fullPage: true });
    } catch (_) {
      // ignore
    }
  }

  let passwordInput = page
    .locator(
      'input[type="password"], input[autocomplete="current-password"], input[name*="password"], input[id*="password"]'
    )
    .first();
  try {
    await passwordInput.waitFor({ state: "visible", timeout: 8000 });
  } catch (_) {
    try {
      await page.waitForFunction(
        () => {
          const hasPassword = !!document.querySelector(
            'input[type="password"], input[autocomplete="current-password"], input[name*="password"], input[id*="password"]'
          );
          const hasRiskCode = !!document.querySelector("input.risk-dialog__Input");
          const urlChanged = !location.href.toLowerCase().includes("/user/login");
          return hasPassword || hasRiskCode || urlChanged;
        },
        { timeout: 7000 }
      );
    } catch (_) {
      try {
        await cont.click({ force: true });
      } catch (_) {
        // ignore
      }
      await page.waitForTimeout(1500);
    }
    await passwordInput.waitFor({ state: "visible", timeout: 15000 });
  }

  try {
    await page.waitForLoadState("load", { timeout: 10000 });
  } catch (_) {
    // ignore
  }
  await passwordInput.click();
  await passwordInput.fill(acc.sheinPassword);

  let signin = page.locator("button.page__login_mainButton:has-text('تسجيل الدخول')").first();
  if ((await signin.count()) === 0) signin = page.locator("button:has-text('تسجيل الدخول')").first();
  await signin.waitFor({ state: "visible", timeout: 10000 });
  await signin.click();

  try {
    const codeInput = page.locator("input.risk-dialog__Input").first();
    await codeInput.waitFor({ state: "visible", timeout: 12000 });
    await page.waitForTimeout(4000);
    console.log("[DEBUG] SHEIN verification dialog detected, checking Gmail...");

    const code = await getLatestSheinCode(acc.gmailEmail, acc.gmailAppPassword, 180);
    console.log("[DEBUG] Gmail code =", JSON.stringify(code));

    if (!code) {
      await page.screenshot({ path: path.join(DEBUG_DIR, "debug_no_code_found.png"), fullPage: true });
      throw new Error("Verification code not found. Saved debug_no_code_found.png");
    }

    await codeInput.click();
    await codeInput.press("Control+A");
    await codeInput.type(code, { delay: 60 });

    let submitBtn = page.locator("button.risk-dialog__subtn:has-text('تقديم')").first();
    if ((await submitBtn.count()) === 0) submitBtn = page.locator("button:has-text('تقديم')").first();
    await submitBtn.waitFor({ state: "visible", timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(6000);
  } catch (error) {
    if (!String(error.message || "").includes("Timeout")) throw error;
  }

  try {
    let skipBtn = page.locator('[aria-label="تخطي"]').first();
    if ((await skipBtn.count()) === 0) skipBtn = page.locator("button:has-text('تخطي')").first();
    await skipBtn.waitFor({ state: "visible", timeout: 5000 });
    await skipBtn.click();
    await page.waitForTimeout(1000);
  } catch (_) {
    // ignore
  }

  await page.goto(fetchUrl || `${baseUrl}/user/orders/list`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
}

async function fetchOneOrder(page, baseUrl, orderNo) {
  const trackUrl = `${baseUrl}/orders/track?billno=${orderNo}`;
  await page.goto(trackUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  console.log("[DEBUG] Track page final URL:", page.url());
  const html = await page.content();
  const ssrText = extractSsrBlock(html);
  if (!ssrText) {
    console.log(`[DEBUG] SSR var not found for ${orderNo} -> returning nulls`);
    return {
      carrier: null,
      tracking_no: null,
      status_text: null,
      last_details: null,
      last_timestamp: null,
      delivered: false,
      track_url: trackUrl,
      _used: "ssr_missing",
    };
  }

  const ssrJson = jsonParseSsr(ssrText);
  if (ssrJson) {
    const pkg = pullPkgFromJson(ssrJson);
    if (pkg) {
      const carrier = pkg.carrier_name || null;
      const trackingNo = pkg.track_num || null;
      const carrierTrackUrl = pkg.track_url || trackUrl;
      const tracks = Array.isArray(pkg.logistics_tracks_list) ? pkg.logistics_tracks_list : [];
      const splitInfo = collectSplitInfo(ssrJson, ssrText, pkg);
      const last = tracks.length
        ? [...tracks].sort((a, b) => Number(a?.timestamp || 0) - Number(b?.timestamp || 0)).at(-1)
        : null;

      return {
        carrier,
        tracking_no: trackingNo,
        status_text: last?.details || null,
        last_details: last?.details || null,
        last_timestamp: last?.timestamp || null,
        delivered: last ? isDeliveredFromLastEvent(last) : false,
        track_url: carrierTrackUrl,
        is_split: splitInfo.is_split,
        split_count: splitInfo.split_count,
        all_tracking_numbers: splitInfo.all_tracking_numbers,
        all_package_refs: splitInfo.all_package_refs,
        _used: "ssr_json",
      };
    }

    const splitInfo = collectSplitInfo(ssrJson, ssrText, null);
    return {
      carrier: null,
      tracking_no: null,
      status_text: null,
      last_details: null,
      last_timestamp: null,
      delivered: false,
      track_url: trackUrl,
      is_split: splitInfo.is_split,
      split_count: splitInfo.split_count,
      all_tracking_numbers: splitInfo.all_tracking_numbers,
      all_package_refs: splitInfo.all_package_refs,
      _used: "ssr_json_no_pkg",
    };
  }

  const carrier = regexValue(ssrText, "carrier_name");
  const trackingNo = regexValue(ssrText, "track_num");
  const statusText = regexFirstDetails(ssrText);
  const lastTimestamp = regexFirstTimestamp(ssrText);
  const delivered =
    !!statusText &&
    (statusText.includes("签收") ||
      statusText.toUpperCase().includes("DELIVERED") ||
      statusText.includes("تم التسليم") ||
      statusText.includes("تم تسليم") ||
      statusText.includes("يتم تسليم طلبك"));

  if (!(carrier || trackingNo || statusText)) {
    const splitInfo = collectSplitInfo(null, ssrText, null);
    return {
      carrier: null,
      tracking_no: null,
      status_text: null,
      last_details: null,
      last_timestamp: null,
      delivered: false,
      track_url: trackUrl,
      is_split: splitInfo.is_split,
      split_count: splitInfo.split_count,
      all_tracking_numbers: splitInfo.all_tracking_numbers,
      all_package_refs: splitInfo.all_package_refs,
      _used: "ssr_regex_failed",
    };
  }

  const splitInfo = collectSplitInfo(null, ssrText, null);
  return {
    carrier,
    tracking_no: trackingNo,
    status_text: statusText,
    last_details: statusText,
    last_timestamp: lastTimestamp,
    delivered,
    track_url: trackUrl,
    is_split: splitInfo.is_split,
    split_count: splitInfo.split_count,
    all_tracking_numbers: splitInfo.all_tracking_numbers,
    all_package_refs: splitInfo.all_package_refs,
    _used: "ssr_regex",
  };
}

async function fetchOneOrderWeight(page, baseUrl, orderNo) {
  const trackUrl = `${baseUrl}/orders/track?billno=${orderNo}`;
  await page.goto(trackUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const html = await page.content();
  const ssrText = extractSsrBlock(html);
  if (!ssrText) {
    return {
      order_no: orderNo,
      total_weight_g: null,
      total_weight_kg: null,
      items_counted: null,
      is_split: false,
      split_count: 0,
      all_tracking_numbers: [],
      all_package_refs: [],
      _used: "ssr_missing",
    };
  }

  const ssrJson = jsonParseSsr(ssrText);
  if (!ssrJson) {
    const splitInfo = collectSplitInfo(null, ssrText, null);
    return {
      order_no: orderNo,
      total_weight_g: null,
      total_weight_kg: null,
      items_counted: null,
      is_split: splitInfo.is_split,
      split_count: splitInfo.split_count,
      all_tracking_numbers: splitInfo.all_tracking_numbers,
      all_package_refs: splitInfo.all_package_refs,
      _used: "ssr_json_parse_failed",
    };
  }

  const weights = computeTotalWeight(ssrJson);
  const splitInfo = collectSplitInfo(ssrJson, ssrText, pullPkgFromJson(ssrJson));
  return {
    order_no: orderNo,
    total_weight_g: weights.total_weight_g,
    total_weight_kg: weights.total_weight_kg,
    items_counted: weights.items_counted,
    is_split: splitInfo.is_split,
    split_count: splitInfo.split_count,
    all_tracking_numbers: splitInfo.all_tracking_numbers,
    all_package_refs: splitInfo.all_package_refs,
    _used: "ssr_weight",
  };
}

async function fetchWeightForOrder({
  storageState,
  sheinEmail,
  sheinPassword,
  gmailEmail,
  gmailAppPassword,
  orderNo,
  profileKey = "default",
  baseUrl = DEFAULT_BASE_URL,
  headless = false,
}) {
  const profilePath = path.join(PROFILES_DIR, profileKey);
  fs.mkdirSync(profilePath, { recursive: true });

  const ctx = await chromium.launchPersistentContext(profilePath, {
    headless,
    locale: "ar",
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  try {
    await ensureLoggedIn(
      page,
      baseUrl,
      { sheinEmail, sheinPassword, gmailEmail, gmailAppPassword, storageState },
      `${baseUrl}/orders/track?billno=${orderNo}`,
      headless
    );
    return await fetchOneOrderWeight(page, baseUrl, orderNo);
  } finally {
    await ctx.close();
  }
}

async function fetchTrackingForOrder({
  storageState,
  sheinEmail,
  sheinPassword,
  gmailEmail,
  gmailAppPassword,
  orderNo,
  profileKey = "default",
  baseUrl = DEFAULT_BASE_URL,
  headless = false,
}) {
  const profilePath = path.join(PROFILES_DIR, profileKey);
  fs.mkdirSync(profilePath, { recursive: true });

  const ctx = await chromium.launchPersistentContext(profilePath, {
    headless,
    locale: "ar",
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  try {
    const trackUrl = `${baseUrl}/orders/track?billno=${orderNo}`;
    await ensureLoggedIn(
      page,
      baseUrl,
      { sheinEmail, sheinPassword, gmailEmail, gmailAppPassword, storageState },
      trackUrl,
      headless
    );
    const info = await fetchOneOrder(page, baseUrl, orderNo);
    return {
      carrier: info.carrier,
      tracking_no: info.tracking_no,
      status_text: info.status_text,
      last_details: info.last_details,
      last_timestamp: info.last_timestamp,
      delivered: Boolean(info.delivered),
      track_url: info.track_url,
      is_split: Boolean(info.is_split),
      split_count: Number(info.split_count || 0),
      all_tracking_numbers: info.all_tracking_numbers || [],
      all_package_refs: info.all_package_refs || [],
      _used: info._used || "playwright_persistent_profile",
    };
  } finally {
    await ctx.close();
  }
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function buildTrackResponse(orderNo, result) {
  return {
    ok: true,
    order_no: orderNo,
    carrier: result.carrier ?? null,
    tracking_no: result.tracking_no ?? null,
    status_text: result.status_text ?? null,
    last_details: result.last_details ?? null,
    last_timestamp: result.last_timestamp ?? null,
    delivered: Boolean(result.delivered),
    track_url: result.track_url ?? null,
    is_split: Boolean(result.is_split),
    split_count: Number(result.split_count || 0),
    all_tracking_numbers: result.all_tracking_numbers || [],
    all_package_refs: result.all_package_refs || [],
    _used: result._used,
  };
}

function buildWeightResponse(orderNo, result) {
  return {
    ok: true,
    order_no: orderNo,
    total_weight_g: result.total_weight_g ?? null,
    total_weight_kg: result.total_weight_kg ?? null,
    items_counted: result.items_counted ?? null,
    is_split: Boolean(result.is_split),
    split_count: Number(result.split_count || 0),
    all_tracking_numbers: result.all_tracking_numbers || [],
    all_package_refs: result.all_package_refs || [],
    _used: result._used,
  };
}

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));

app.get("/ping", (_req, res) => {
  res.json({ ok: true, msg: "pong" });
});

app.post(
  "/api/register",
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const ownerUserId = body.owner_user_id ?? null;
    const gmailEmail = normalizeEmail(body.gmail_email);
    const gmailAppPassword = String(body.gmail_app_password || "").replace(/\s+/g, "");
    const sheinEmail = normalizeEmail(body.shein_email);
    const sheinPassword = String(body.shein_password || "");

    if (!email || !gmailEmail || !gmailAppPassword || !sheinEmail || !sheinPassword) {
      throw new HttpError(400, "Missing required fields.");
    }

    const selectSql = withOwnerFilter("SELECT * FROM shein_api_users WHERE email = ?", ownerUserId) + " LIMIT 1";
    const params = ownerUserId !== null && ownerUserId !== undefined ? [email, ownerUserId] : [email];
    const existing = await getOne(selectSql, params);

    if (existing) {
      await query(
        `
          UPDATE shein_api_users
          SET owner_user_id = ?, gmail_email = ?, gmail_app_password_enc = ?, shein_email = ?, shein_password_enc = ?
          WHERE id = ?
        `,
        [
          ownerUserId,
          gmailEmail,
          encryptStr(APP_SECRET, gmailAppPassword),
          sheinEmail,
          encryptStr(APP_SECRET, sheinPassword),
          existing.id,
        ]
      );
      res.json({ ok: true, message: "Updated credentials." });
      return;
    }

    await query(
      `
        INSERT INTO shein_api_users
        (owner_user_id, email, gmail_email, gmail_app_password_enc, shein_email, shein_password_enc)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        ownerUserId,
        email,
        gmailEmail,
        encryptStr(APP_SECRET, gmailAppPassword),
        sheinEmail,
        encryptStr(APP_SECRET, sheinPassword),
      ]
    );

    res.json({ ok: true, message: "Registered." });
  })
);

app.post(
  "/api/orders",
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const email = normalizeEmail(body.email);
    const ownerUserId = body.owner_user_id ?? null;
    const orderNo = String(body.order_no || "").trim();

    const selectSql = withOwnerFilter("SELECT * FROM shein_api_users WHERE email = ?", ownerUserId) + " LIMIT 1";
    const params = ownerUserId !== null && ownerUserId !== undefined ? [email, ownerUserId] : [email];
    const user = await getOne(selectSql, params);
    if (!user) throw new HttpError(404, "User not found. Register first.");

    const existing = await getOne("SELECT * FROM shein_api_orders WHERE user_id = ? AND order_no = ? LIMIT 1", [
      user.id,
      orderNo,
    ]);
    if (existing) {
      res.json({ ok: true, message: "Order already exists." });
      return;
    }

    await query("INSERT INTO shein_api_orders (user_id, order_no) VALUES (?, ?)", [user.id, orderNo]);
    res.json({ ok: true, message: "Order added." });
  })
);

app.get(
  "/api/orders",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.query.email);
    const ownerUserId = req.query.owner_user_id !== undefined ? Number(req.query.owner_user_id) : null;
    const selectSql = withOwnerFilter("SELECT * FROM shein_api_users WHERE email = ?", ownerUserId) + " LIMIT 1";
    const params = ownerUserId !== null && !Number.isNaN(ownerUserId) ? [email, ownerUserId] : [email];
    const user = await getOne(selectSql, params);
    if (!user) throw new HttpError(404, "User not found.");

    const orders = await query("SELECT * FROM shein_api_orders WHERE user_id = ?", [user.id]);
    res.json({
      ok: true,
      orders: orders.map((order) => ({
        order_no: order.order_no,
        carrier: order.carrier,
        tracking_no: order.tracking_no,
        status_text: order.status_text,
        delivered: Boolean(order.delivered),
        last_details: order.last_details,
        last_timestamp: order.last_timestamp,
      })),
    });
  })
);

app.get(
  "/api/users",
  asyncRoute(async (req, res) => {
    let sql = "SELECT email FROM shein_api_users WHERE 1=1";
    const params = [];
    if (req.query.email) {
      sql += " AND email = ?";
      params.push(normalizeEmail(req.query.email));
    }
    if (req.query.owner_user_id !== undefined) {
      sql += " AND owner_user_id = ?";
      params.push(Number(req.query.owner_user_id));
    }
    const users = await query(sql, params);
    res.json({ ok: true, users: users.map((user) => ({ email: user.email })) });
  })
);

app.delete(
  "/api/users",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.query.email);
    const ownerUserId = req.query.owner_user_id !== undefined ? Number(req.query.owner_user_id) : null;
    const selectSql = withOwnerFilter("SELECT * FROM shein_api_users WHERE email = ?", ownerUserId) + " LIMIT 1";
    const params = ownerUserId !== null && !Number.isNaN(ownerUserId) ? [email, ownerUserId] : [email];
    const user = await getOne(selectSql, params);
    if (!user) throw new HttpError(404, "User not found.");

    await query("DELETE FROM shein_api_users WHERE id = ?", [user.id]);
    res.json({ ok: true, message: "User deleted." });
  })
);

app.get(
  "/api/users/detail",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.query.email);
    const ownerUserId = req.query.owner_user_id !== undefined ? Number(req.query.owner_user_id) : null;
    const selectSql = withOwnerFilter("SELECT * FROM shein_api_users WHERE email = ?", ownerUserId) + " LIMIT 1";
    const params = ownerUserId !== null && !Number.isNaN(ownerUserId) ? [email, ownerUserId] : [email];
    const user = await getOne(selectSql, params);
    if (!user) throw new HttpError(404, "User not found.");

    res.json({
      ok: true,
      user: {
        email: user.email,
        owner_user_id: user.owner_user_id,
        gmail_email: user.gmail_email,
        gmail_app_password: decryptStr(APP_SECRET, user.gmail_app_password_enc),
        shein_email: user.shein_email,
        shein_password: decryptStr(APP_SECRET, user.shein_password_enc),
      },
    });
  })
);

app.post(
  "/api/track/one",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const orderNo = String(req.body?.order_no || "").trim();
    const { user, profileKey, sheinEmail, sheinPassword, gmailEmail, gmailAppPassword } =
      await loadUserAndCreds(email);
    await requireOrderBelongsToUser(user.id, orderNo);

    const result = await fetchTrackingForOrder({
      storageState: null,
      sheinEmail,
      sheinPassword,
      gmailEmail,
      gmailAppPassword,
      orderNo,
      profileKey,
      headless: PLAYWRIGHT_HEADLESS,
    });

    res.json(buildTrackResponse(orderNo, result));
  })
);

app.post(
  "/api/track/refresh",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    console.log("Starting tracking refresh for:", email);

    const { user, profileKey, sheinEmail, sheinPassword, gmailEmail, gmailAppPassword } =
      await loadUserAndCreds(email);
    const pending = await query("SELECT * FROM shein_api_orders WHERE user_id = ? AND delivered = 0", [user.id]);

    const updated = [];
    for (const order of pending) {
      try {
        console.log("Refreshing order:", order.order_no);
        const result = await fetchTrackingForOrder({
          storageState: null,
          sheinEmail,
          sheinPassword,
          gmailEmail,
          gmailAppPassword,
          orderNo: order.order_no,
          profileKey,
          headless: PLAYWRIGHT_HEADLESS,
        });

        await query(
          `
            UPDATE shein_api_orders
            SET carrier = ?, tracking_no = ?, status_text = ?, last_details = ?, last_timestamp = ?, delivered = ?
            WHERE id = ?
          `,
          [
            result.carrier,
            result.tracking_no,
            result.status_text,
            result.last_details,
            result.last_timestamp,
            result.delivered ? 1 : 0,
            order.id,
          ]
        );

        updated.push({
          order_no: order.order_no,
          carrier: result.carrier,
          tracking_no: result.tracking_no,
          status_text: result.status_text,
          delivered: Boolean(result.delivered),
          track_url: result.track_url,
          is_split: Boolean(result.is_split),
          split_count: Number(result.split_count || 0),
          all_tracking_numbers: result.all_tracking_numbers || [],
          all_package_refs: result.all_package_refs || [],
          _used: result._used,
        });
      } catch (error) {
        updated.push({
          order_no: order.order_no,
          error: `${error.name}: ${error.message}`,
          _used: "exception",
        });
      }
    }

    res.json({ ok: true, updated, count: updated.length });
  })
);

app.post(
  "/api/weight/one",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const orderNo = String(req.body?.order_no || "").trim();
    const { user, profileKey, sheinEmail, sheinPassword, gmailEmail, gmailAppPassword } =
      await loadUserAndCreds(email);
    await requireOrderBelongsToUser(user.id, orderNo);

    const result = await fetchWeightForOrder({
      storageState: null,
      sheinEmail,
      sheinPassword,
      gmailEmail,
      gmailAppPassword,
      orderNo,
      profileKey,
      headless: PLAYWRIGHT_HEADLESS,
    });

    res.json(buildWeightResponse(orderNo, result));
  })
);

app.post(
  "/api/weight/batch",
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const onlyPending = Boolean(req.body?.only_pending);
    const { user, profileKey, sheinEmail, sheinPassword, gmailEmail, gmailAppPassword } =
      await loadUserAndCreds(email);

    const orders = await query(
      `SELECT * FROM shein_api_orders WHERE user_id = ?${onlyPending ? " AND delivered = 0" : ""}`,
      [user.id]
    );

    const results = [];
    for (const order of orders) {
      try {
        const result = await fetchWeightForOrder({
          storageState: null,
          sheinEmail,
          sheinPassword,
          gmailEmail,
          gmailAppPassword,
          orderNo: order.order_no,
          profileKey,
          headless: PLAYWRIGHT_HEADLESS,
        });
        results.push({
          order_no: order.order_no,
          total_weight_g: result.total_weight_g,
          total_weight_kg: result.total_weight_kg,
          items_counted: result.items_counted,
          is_split: Boolean(result.is_split),
          split_count: Number(result.split_count || 0),
          all_tracking_numbers: result.all_tracking_numbers || [],
          all_package_refs: result.all_package_refs || [],
          _used: result._used,
        });
      } catch (error) {
        results.push({
          order_no: order.order_no,
          error: `${error.name}: ${error.message}`,
          _used: "exception",
        });
      }
    }

    res.json({ ok: true, results, count: results.length });
  })
);

app.post(
  "/api/direct/track_one",
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const orderNo = String(body.order_no || "").trim();
    const result = await fetchTrackingForOrder({
      storageState: body.storage_state_json || null,
      sheinEmail: String(body.shein_email || "").trim(),
      sheinPassword: String(body.shein_password || ""),
      gmailEmail: String(body.gmail_email || "").trim(),
      gmailAppPassword: String(body.gmail_app_password || "").replace(/\s+/g, ""),
      orderNo,
      profileKey: String(body.profile_key || "default").trim(),
      headless: PLAYWRIGHT_HEADLESS,
    });

    res.json(buildTrackResponse(orderNo, result));
  })
);

app.post(
  "/api/direct/weight_one",
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const orderNo = String(body.order_no || "").trim();
    const result = await fetchWeightForOrder({
      storageState: body.storage_state_json || null,
      sheinEmail: String(body.shein_email || "").trim(),
      sheinPassword: String(body.shein_password || ""),
      gmailEmail: String(body.gmail_email || "").trim(),
      gmailAppPassword: String(body.gmail_app_password || "").replace(/\s+/g, ""),
      orderNo,
      profileKey: String(body.profile_key || "default").trim(),
      headless: PLAYWRIGHT_HEADLESS,
    });

    res.json(buildWeightResponse(orderNo, result));
  })
);

app.post(
  "/api/direct/weight_many",
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const seen = new Set();
    const orderNos = [];

    for (const raw of body.order_nos || []) {
      const orderNo = String(raw || "").trim();
      if (!orderNo || seen.has(orderNo)) continue;
      seen.add(orderNo);
      orderNos.push(orderNo);
    }

    if (!orderNos.length) throw new HttpError(400, "order_nos is required");

    let storageState = body.storage_state_json || null;
    const results = [];

    for (const orderNo of orderNos) {
      try {
        const result = await fetchWeightForOrder({
          storageState,
          sheinEmail: String(body.shein_email || "").trim(),
          sheinPassword: String(body.shein_password || ""),
          gmailEmail: String(body.gmail_email || "").trim(),
          gmailAppPassword: String(body.gmail_app_password || "").replace(/\s+/g, ""),
          orderNo,
          profileKey: String(body.profile_key || "default").trim(),
          headless: PLAYWRIGHT_HEADLESS,
        });

        storageState = result._storage_state || storageState;
        results.push({
          ok: true,
          order_no: orderNo,
          total_weight_g: result.total_weight_g,
          total_weight_kg: result.total_weight_kg,
          items_counted: result.items_counted,
          is_split: Boolean(result.is_split),
          split_count: Number(result.split_count || 0),
          all_tracking_numbers: result.all_tracking_numbers || [],
          all_package_refs: result.all_package_refs || [],
          _used: result._used,
        });
      } catch (error) {
        results.push({
          ok: false,
          order_no: orderNo,
          error: `${error.name}: ${error.message}`,
        });
      }
    }

    res.json({ ok: true, count: results.length, results, storage_state_json: storageState });
  })
);

app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : 500;
  const message = err instanceof HttpError ? err.message : `${err.name || "Error"}: ${err.message}`;
  console.error(`[ERROR] ${message}\n${err.stack || ""}`);
  res.status(status).json({ ok: false, error: message });
});

let dbReady = false;
ensureTables()
  .then(() => {
    dbReady = true;
  })
  .catch((error) => {
    console.warn(`[WARN] DB unavailable at startup: ${error.name}: ${error.message}`);
  });

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`SHEIN Tracker API v2 listening on http://${HOST}:${PORT}`);
    if (!dbReady) console.log("[WARN] DB tables were not confirmed at startup.");
  });
}

module.exports = {
  app,
  encryptStr,
  decryptStr,
  fetchTrackingForOrder,
  fetchWeightForOrder,
};
