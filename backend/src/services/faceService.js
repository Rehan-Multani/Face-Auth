const crypto = require('crypto');
const env = require('../config/env');

const CHALLENGE_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

// In-memory set for single-use nonce tracking with automatic TTL cleanup
const consumedNonces = new Map();

// Periodic prune of expired nonces (every 60 seconds)
setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiresAt] of consumedNonces.entries()) {
    if (now > expiresAt) {
      consumedNonces.delete(nonce);
    }
  }
}, 60000).unref();

/**
 * Generate a cryptographically secure, single-use anti-replay challenge signed by the server
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
    challengeId: nonce,
    challengeToken: `${payload}:${signature}`,
    expiresInMs: CHALLENGE_EXPIRY_MS,
  };
};

/**
 * Verify and CONSUME an anti-replay challenge token (Single-use enforcement)
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

  // Check if nonce was already consumed (Replay Attack Prevention)
  if (consumedNonces.has(nonce)) {
    return { valid: false, reason: 'CHALLENGE_ALREADY_USED' };
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

  if (!valid) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  // Mark nonce as consumed until its expiration
  consumedNonces.set(nonce, timestamp + CHALLENGE_EXPIRY_MS);

  return { valid: true, nonce };
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

/**
 * Synthesize multiple face samples into a high-quality enrolled template
 */
const synthesizeEnrolledTemplate = (samples) => {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('No face samples provided for enrollment.');
  }

  // Handle single sample input
  if (!Array.isArray(samples[0])) {
    const valid = validateFaceVector(samples);
    if (!valid.valid) throw new Error(valid.message);
    return {
      template: samples,
      qualityScore: 1.0,
      samplesCount: 1,
    };
  }

  const validSamples = samples.filter((s) => validateFaceVector(s).valid);
  if (validSamples.length === 0) {
    throw new Error('All provided face samples are invalid.');
  }

  const vectorLen = validSamples[0].length;
  const combined = new Float64Array(vectorLen);

  for (const sample of validSamples) {
    for (let i = 0; i < vectorLen; i++) {
      combined[i] += sample[i];
    }
  }

  // Average and compute L2 unit norm
  let normSum = 0;
  for (let i = 0; i < vectorLen; i++) {
    combined[i] /= validSamples.length;
    normSum += combined[i] * combined[i];
  }

  const l2 = Math.sqrt(normSum) || 1;
  const finalTemplate = new Array(vectorLen);
  for (let i = 0; i < vectorLen; i++) {
    finalTemplate[i] = parseFloat((combined[i] / l2).toFixed(6));
  }

  return {
    template: finalTemplate,
    qualityScore: Math.min(1.0, 0.8 + validSamples.length * 0.1),
    samplesCount: validSamples.length,
  };
};

/**
 * 1:N Biometric Candidate Ranking
 */
const rankCandidates = (liveVector, candidateCredentials, threshold) => {
  const ranked = [];

  for (const cred of candidateCredentials) {
    if (!cred.template || !Array.isArray(cred.template) || cred.template.length === 0) {
      continue;
    }

    const similarity = calculateCosineSimilarity(liveVector, cred.template);
    const distance = calculateEuclideanDistance(liveVector, cred.template);

    if (similarity >= threshold) {
      ranked.push({
        credential: cred,
        user: cred.user,
        similarity,
        distance,
      });
    }
  }

  // Sort descending by highest similarity score
  ranked.sort((a, b) => b.similarity - a.similarity);
  return ranked;
};

module.exports = {
  generateFaceChallenge,
  verifyFaceChallenge,
  calculateEuclideanDistance,
  calculateCosineSimilarity,
  validateFaceVector,
  synthesizeEnrolledTemplate,
  rankCandidates,
};

