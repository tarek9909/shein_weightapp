const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-jwt-secret-with-more-than-32-characters";
process.env.CREDENTIAL_ENCRYPTION_KEY = "test-encryption-key-with-more-than-32-characters";

const { number, finite } = require("../lib/helpers");
const { seal, open } = require("../lib/secretBox");
const { createToken } = require("../middleware/auth");

test("numeric parsing rejects invalid input instead of converting it to zero", () => {
  assert.equal(number("12.50"), 12.5);
  assert.equal(number(""), 0);
  assert.equal(finite("12.50"), true);
  assert.equal(finite("not-a-number"), false);
  assert.equal(Number.isNaN(number("not-a-number")), true);
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
