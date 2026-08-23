const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit, recommended IV size for GCM
const KEY_LENGTH = 32; // AES-256 requires a 32-byte key

const keyCache = new Map();

/**
 * Load (and cache) a versioned biometric encryption key from the environment.
 * Keys are never hardcoded; each version lives in its own env var
 * (BIOMETRIC_KEY_V1, BIOMETRIC_KEY_V2, ...) so rotation is additive: add the
 * new key, bump BIOMETRIC_ACTIVE_KEY_VERSION, and old templates still decrypt
 * via the keyVersion stored alongside them.
 */
const loadKey = (version) => {
  if (keyCache.has(version)) return keyCache.get(version);

  const envVarName = `BIOMETRIC_KEY_${String(version).toUpperCase()}`;
  const rawKey = process.env[envVarName];
  if (!rawKey) return null;

  const keyBuffer = Buffer.from(rawKey, 'base64');
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(
      `Biometric encryption key "${envVarName}" must decode to exactly ${KEY_LENGTH} bytes (got ${keyBuffer.length}).`
    );
  }

  keyCache.set(version, keyBuffer);
  return keyBuffer;
};

const getActiveKeyVersion = () => env.BIOMETRIC_ACTIVE_KEY_VERSION;

/**
 * Encrypt a biometric template (array of numbers) with AES-256-GCM using the
 * currently active key version. Never call this with anything that should
 * end up logged — the returned blob is ciphertext, but the input vector is
 * plaintext biometric data.
 */
const encryptTemplate = (vector) => {
  const version = getActiveKeyVersion();
  const key = loadKey(version);
  if (!key) {
    throw new Error(`BIOMETRIC_ENCRYPTION_KEY_MISSING:${version}`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(vector), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: version,
  };
};

/**
 * Decrypt a biometric template blob. Throws (fails safe) if the ciphertext
 * or auth tag has been tampered with, or if the referenced key version is
 * unavailable.
 */
const decryptTemplate = (blob) => {
  if (!blob || !blob.iv || !blob.ciphertext || !blob.authTag || !blob.keyVersion) {
    throw new Error('INVALID_ENCRYPTED_TEMPLATE');
  }

  const key = loadKey(blob.keyVersion);
  if (!key) {
    throw new Error(`BIOMETRIC_ENCRYPTION_KEY_MISSING:${blob.keyVersion}`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.authTag, 'base64'));

  // decipher.final() throws if the ciphertext/authTag were tampered with —
  // this is the fail-safe path for corrupted or forged encrypted templates.
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'base64')),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString('utf8'));
};

module.exports = {
  encryptTemplate,
  decryptTemplate,
  getActiveKeyVersion,
};
