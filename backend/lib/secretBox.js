const crypto = require("crypto");

const DEFAULTS = new Set(["", "CHANGE_THIS_SECRET_123", "replace-me", "change-me"]);

function encryptionKey() {
  const raw = String(process.env.CREDENTIAL_ENCRYPTION_KEY || "").trim();
  if (DEFAULTS.has(raw) || raw.length < 32 || /change|replace|default|your[_ -]?|<|>/i.test(raw)) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be configured with at least 32 characters");
  }
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

function seal(value) {
  if (value == null || value === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${ciphertext.toString("base64url")}`;
}

function open(value) {
  if (value == null || value === "") return null;
  const text = String(value);
  if (!text.startsWith("v1:")) return text;
  const [, iv, tag, ciphertext] = text.split(":");
  if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function assertSecretConfig() { encryptionKey(); }

module.exports = { seal, open, assertSecretConfig };
