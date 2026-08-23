const crypto = require('crypto');
const env = require('../config/env');
const SecurityNonce = require('../models/SecurityNonce');

const CHALLENGE_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

const LIVENESS_ACTIONS = ['BLINK', 'TURN_LEFT', 'TURN_RIGHT'];

// Relative luminance dip required in the middle frame of a 3-frame burst to
// count as a genuine blink (normalized against the outer two frames, so it's
// robust to ambient-lighting differences between devices).
const BLINK_RELATIVE_DIP_THRESHOLD = 0.08;
// Minimum horizontal shift (as a fraction of ROI width, 0..1) of the
// gradient centroid between the first and last frame to count as a head turn.
const TURN_CENTROID_SHIFT_THRESHOLD = 0.04;

/**
 * Generate a cryptographically secure, single-use anti-replay challenge
 * signed by the server, paired with a randomized active-liveness action the
 * client must perform and prove during capture. Fully stateless to generate
 * (no DB write) — only *verifying* a challenge touches storage, to record
 * that it was consumed.
 */
const generateFaceChallenge = () => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  const livenessAction = LIVENESS_ACTIONS[crypto.randomInt(LIVENESS_ACTIONS.length)];
  const payload = `${nonce}:${timestamp}:${livenessAction}`;
  const signature = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest('hex');

  return {
    challengeId: nonce,
    challengeToken: `${payload}:${signature}`,
    livenessAction,
    expiresInMs: CHALLENGE_EXPIRY_MS,
  };
};

/**
 * Verify and CONSUME an anti-replay challenge token (single-use enforcement).
 * Cheap, local checks (shape, expiry, signature) run first; only a token
 * that is already well-formed, unexpired, and validly signed reaches the
 * database, where consumption is enforced by an atomic unique-index insert
 * into SecurityNonce — a duplicate-key error means the token was replayed.
 */
const verifyFaceChallenge = async (challengeToken) => {
  if (!challengeToken || typeof challengeToken !== 'string') {
    return { valid: false, reason: 'MISSING_CHALLENGE_TOKEN' };
  }

  const parts = challengeToken.split(':');
  if (parts.length !== 4) {
    return { valid: false, reason: 'MALFORMED_CHALLENGE_TOKEN' };
  }

  const [nonce, timestampStr, livenessAction, providedSignature] = parts;
  const timestamp = parseInt(timestampStr, 10);

  if (!LIVENESS_ACTIONS.includes(livenessAction)) {
    return { valid: false, reason: 'MALFORMED_CHALLENGE_TOKEN' };
  }

  if (isNaN(timestamp) || Date.now() - timestamp > CHALLENGE_EXPIRY_MS) {
    return { valid: false, reason: 'CHALLENGE_EXPIRED' };
  }

  if (timestamp > Date.now() + 5000) {
    return { valid: false, reason: 'INVALID_TIMESTAMP' };
  }

  const payload = `${nonce}:${timestampStr}:${livenessAction}`;
  const expectedSignature = crypto
    .createHmac('sha256', env.JWT_ACCESS_SECRET)
    .update(payload)
    .digest('hex');

  const providedSigBuffer = Buffer.from(providedSignature, 'hex');
  const expectedSigBuffer = Buffer.from(expectedSignature, 'hex');
  const validSignature =
    providedSigBuffer.length === expectedSigBuffer.length &&
    crypto.timingSafeEqual(providedSigBuffer, expectedSigBuffer);

  if (!validSignature) {
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }

  // Consume the nonce: an atomic insert that fails on duplicate key if this
  // nonce was already used (replay attempt).
  try {
    await SecurityNonce.create({
      nonce,
      expiresAt: new Date(timestamp + CHALLENGE_EXPIRY_MS),
    });
  } catch (err) {
    if (err.code === 11000) {
      return { valid: false, reason: 'CHALLENGE_ALREADY_USED' };
    }
    throw err;
  }

  return { valid: true, nonce, livenessAction };
};

/**
 * Verify a 3-frame active-liveness signal against the action the signed
 * challenge required. This is a lightweight heuristic — it defeats static
 * photo attacks (a photo cannot blink or turn) and naive replay, but is NOT
 * ML-based presentation-attack detection; a sophisticated prerecorded video
 * of the real user performing the action could still pass.
 */
const verifyLivenessSignal = (action, frameSignals) => {
  if (!LIVENESS_ACTIONS.includes(action)) {
    return { valid: false, reason: 'INVALID_LIVENESS_ACTION' };
  }

  if (!Array.isArray(frameSignals) || frameSignals.length !== 3) {
    return { valid: false, reason: 'INVALID_LIVENESS_SIGNAL_SHAPE' };
  }

  for (const frame of frameSignals) {
    if (
      !frame ||
      typeof frame.eyeStripMean !== 'number' ||
      typeof frame.gradientCentroidX !== 'number' ||
      !isFinite(frame.eyeStripMean) ||
      !isFinite(frame.gradientCentroidX)
    ) {
      return { valid: false, reason: 'INVALID_LIVENESS_SIGNAL_SHAPE' };
    }
  }

  if (action === 'BLINK') {
    const baseline = (frameSignals[0].eyeStripMean + frameSignals[2].eyeStripMean) / 2;
    const dip = baseline - frameSignals[1].eyeStripMean;
    const relativeDip = dip / Math.max(1, baseline);

    if (relativeDip < BLINK_RELATIVE_DIP_THRESHOLD) {
      return { valid: false, reason: 'LIVENESS_ACTION_NOT_DETECTED' };
    }
    return { valid: true };
  }

  // TURN_LEFT / TURN_RIGHT
  const shift = frameSignals[2].gradientCentroidX - frameSignals[0].gradientCentroidX;
  const expectedSign = action === 'TURN_LEFT' ? -1 : 1;
  const passed = shift * expectedSign > TURN_CENTROID_SHIFT_THRESHOLD;

  if (!passed) {
    return { valid: false, reason: 'LIVENESS_ACTION_NOT_DETECTED' };
  }
  return { valid: true };
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
 * 1:1 biometric verification against a single known device-bound credential.
 * Deliberately does not accept a list of candidates — there is no code path
 * in this service that scans across users.
 */
const verifyOneToOne = (liveVector, enrolledTemplate, threshold) => {
  const similarity = calculateCosineSimilarity(liveVector, enrolledTemplate);
  const distance = calculateEuclideanDistance(liveVector, enrolledTemplate);
  return {
    matched: similarity >= threshold,
    similarity,
    distance,
  };
};

module.exports = {
  LIVENESS_ACTIONS,
  generateFaceChallenge,
  verifyFaceChallenge,
  verifyLivenessSignal,
  calculateEuclideanDistance,
  calculateCosineSimilarity,
  validateFaceVector,
  synthesizeEnrolledTemplate,
  verifyOneToOne,
};
