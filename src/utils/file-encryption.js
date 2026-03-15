'use strict';

/**
 * Cifrado de archivos clínicos (AES-256-GCM).
 * Usa crypto nativo de Node.js. Activo cuando FILE_ENCRYPTION_KEY está definido (64 hex chars).
 */
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

function getKey() {
  const keyHex = process.env.FILE_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('FILE_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate: openssl rand -hex 32');
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt file buffer. Output: iv (12) + authTag (16) + ciphertext.
 * Never log the key or decrypted content.
 */
function encryptFile(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt file buffer. Input format: iv (12) + authTag (16) + ciphertext.
 */
function decryptFile(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const key = getKey();
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function isEncryptionEnabled() {
  const key = process.env.FILE_ENCRYPTION_KEY;
  return !!key && key.length === 64;
}

module.exports = {
  encryptFile,
  decryptFile,
  isEncryptionEnabled,
};
