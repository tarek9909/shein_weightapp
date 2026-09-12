const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-jwt-secret-with-more-than-32-characters";
process.env.CREDENTIAL_ENCRYPTION_KEY = "test-encryption-key-with-more-than-32-characters";

const { number, finite, paths } = require("../lib/helpers");
const { seal, open } = require("../lib/secretBox");
const { createToken } = require("../middleware/auth");
const { customerBaseAmount, customerFinalAmount, customerIsCollected } = require("../lib/customerAmounts");
const { remoteBrowserUrl } = require("../lib/shein");

test("numeric parsing rejects invalid input instead of converting it to zero", () => {
  assert.equal(number("12.50"), 12.5);
  assert.equal(number(""), 0);
  assert.equal(finite("12.50"), true);
  assert.equal(finite("not-a-number"), false);
  assert.equal(Number.isNaN(number("not-a-number")), true);
});

test("Node routes use extensionless paths", () => {
  assert.deepEqual(paths("login"), ["/login"]);
  assert.deepEqual(paths("summary", true), ["/summary", "/"]);
});

test("credential encryption round-trips and does not store plaintext", () => {
  const encrypted = seal("secret-value");
  assert.notEqual(encrypted, "secret-value");
  assert.equal(open(encrypted), "secret-value");
});

test("tokens carry an authentication version and a bounded expiry", () => {
  const token = createToken({ id: 7, username: "tester", role: "operations", auth_version: 3 });
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(payload.auth_version, 3);
  assert.ok(payload.exp > Math.floor(Date.now() / 1000));
  assert.ok(payload.exp <= Math.floor(Date.now() / 1000) + 8 * 60 * 60 + 5);
});

test("remote browser URLs never expose credential query parameters", () => {
  const previous = process.env.SHEIN_REMOTE_BROWSER_URL;
  process.env.SHEIN_REMOTE_BROWSER_URL = "https://browser.example/vnc.html?path=websockify&autoconnect=true&password=do-not-expose";
  assert.equal(remoteBrowserUrl(), "https://browser.example/vnc.html?path=websockify&autoconnect=true");
  if (previous === undefined) delete process.env.SHEIN_REMOTE_BROWSER_URL;
  else process.env.SHEIN_REMOTE_BROWSER_URL = previous;
});

test("customer accounting uses the stored final amount and legacy paid state", () => {
  assert.equal(customerBaseAmount({ base_amount_to_collect: "100.00", usd_to_collect: 90 }), 100);
  assert.equal(customerFinalAmount({ base_amount_to_collect: "100.00", delivery_adjustment: "-7.50" }), 92.5);
  assert.equal(customerFinalAmount({ base_amount_to_collect: 100, final_amount_to_collect: "105.25" }), 105.25);
  assert.equal(customerIsCollected({ status: "paid", collection_status: "pending" }), true);
  assert.equal(customerIsCollected({ status: "confirmed", collection_status: "pending" }), false);
});
