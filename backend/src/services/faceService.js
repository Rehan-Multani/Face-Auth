const crypto = require('crypto');
const env = require('../config/env');

const CHALLENGE_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Generate an anti-replay challenge signed by the server
 */
const generateFaceChallenge = () => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const payload = `${nonce}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest('hex');

  return {
    challengeToken: `${payload}:${signature}`,
    expiresInMs: CHALLENGE_EXPIRY_MS,
  };
};

/**
 * Verify that the challenge token was issued by this server and is not expired
 */
const verifyFaceChallenge = (challengeToken) => {
  if (!challengeToken || typeof challengeToken !== 'string') {
    return { valid: false, reason: 'MISSING_CHALLENGE_TOKEN' };
  }

  const parts = challengeToken.split(':');
  if (parts.length !== 3) {
    return { valid: false, reason: 'MALFORMED_CHALLENGE_TOKEN' };
  }

  const [nonce, timestampStr, providedSignature] = parts;
  const timestamp = parseInt(timestampStr, 10);

  if (isNaN(timestamp) || Date.now() - timestamp > CHALLENGE_EXPIRY_MS) {
    return { valid: false, reason: 'CHALLENGE_EXPIRED' };
  }

  if (timestamp > Date.now() + 5000) {
    return { valid: false, reason: 'INVALID_TIMESTAMP' };
  }

  const payload = `${nonce}:${timestampStr}`;
  const expectedSignature = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest('hex');

  const valid = crypto.timingSafeEqual(
    Buffer.from(providedSignature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );

  return valid ? { valid: true } : { valid: false, reason: 'INVALID_SIGNATURE' };
};

/**
 * Calculate Euclidean Distance between two face descriptor vectors
 */
const calculateEuclideanDistance = (v1, v2) => {
  if (!Array.isArray(v1) || !Array.isArray(v2) || v1.length !== v2.length) {
    return Infinity;
  }

  let sum = 0;
  for (let i = 0; i < v1.length; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

/**
 * Calculate Cosine Similarity between two face descriptor vectors
 */
const calculateCosineSimilarity = (v1, v2) => {
  if (!Array.isArray(v1) || !Array.isArray(v2) || v1.length !== v2.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    normA += v1[i] * v1[i];
    normB += v2[i] * v2[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;
  return dotProduct / magnitude;
};

/**
 * Normalize and validate a face vector
 */
const validateFaceVector = (vector) => {
  if (!Array.isArray(vector) || vector.length < 16 || vector.length > 512) {
    return { valid: false, message: 'Invalid face descriptor dimensions (expected array between 16 and 512 numbers)' };
  }

  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !isFinite(vector[i])) {
      return { valid: false, message: 'Face descriptor contains non-finite number values' };
    }
  }

  return { valid: true };
};

module.exports = {
  generateFaceChallenge,
  verifyFaceChallenge,
  calculateEuclideanDistance,
  calculateCosineSimilarity,
  validateFaceVector,
};
