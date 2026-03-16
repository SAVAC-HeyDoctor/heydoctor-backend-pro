"use strict";

/**
 * Field-level encryption for sensitive data (AES-256-GCM).
 * Usa FILE_ENCRYPTION_KEY o FIELD_ENCRYPTION_KEY (64 hex chars).
 */
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const PREFIX = "enc:";

function getKey() {
  const keyHex = process.env.FIELD_ENCRYPTION_KEY || process.env.FILE_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error("FIELD_ENCRYPTION_KEY or FILE_ENCRYPTION_KEY must be 64 hex chars. Generate: openssl rand -hex 32");
  }
  return Buffer.from(keyHex, "hex");
}

function isEncrypted(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function encryptField(plaintext) {
  if (plaintext == null || plaintext === "") return plaintext;
  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return PREFIX + combined.toString("base64");
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Field encryption failed:", err?.message);
    return plaintext;
  }
}

function decryptField(ciphertext) {
  if (ciphertext == null || ciphertext === "") return ciphertext;
  if (!isEncrypted(ciphertext)) return ciphertext;
  try {
    const key = getKey();
    const buffer = Buffer.from(ciphertext.slice(PREFIX.length), "base64");
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch (err) {
    if (global.strapi?.log) global.strapi.log.warn("Field decryption failed:", err?.message);
    return ciphertext;
  }
}

function isFieldEncryptionEnabled() {
  const key = process.env.FIELD_ENCRYPTION_KEY || process.env.FILE_ENCRYPTION_KEY;
  return !!key && key.length === 64;
}

module.exports = {
  encryptField,
  decryptField,
  isEncrypted,
  isFieldEncryptionEnabled,
};
