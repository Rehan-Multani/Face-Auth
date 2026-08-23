const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const faceService = require('../src/services/faceService');
const tokenService = require('../src/services/tokenService');
const encryptionService = require('../src/services/encryption.service');
const MongoRateLimitStore = require('../src/middleware/mongoRateLimitStore');
const SecurityNonce = require('../src/models/SecurityNonce');
const RateLimitCounter = require('../src/models/RateLimitCounter');

before(async () => {
  await connectDB();
});

after(async () => {
  // Dev-only cleanup of these TTL-managed collections; safe to wipe entirely.
  await SecurityNonce.deleteMany({});
  await RateLimitCounter.deleteMany({});
  await mongoose.disconnect();
});

describe('Face Service Tests', () => {
  it('should generate a valid challenge token and verify it', async () => {
    const challenge = faceService.generateFaceChallenge();
    assert.ok(challenge.challengeToken, 'Challenge token should be defined');
    assert.ok(
      faceService.LIVENESS_ACTIONS.includes(challenge.livenessAction),
      'Challenge should include a valid liveness action'
    );

    const verification = await faceService.verifyFaceChallenge(challenge.challengeToken);
    assert.strictEqual(verification.valid, true, 'Fresh challenge token should be valid');
    assert.strictEqual(verification.livenessAction, challenge.livenessAction);
  });

  it('should reject tampered challenge token', async () => {
    const challenge = faceService.generateFaceChallenge();
    const tampered = challenge.challengeToken.slice(0, -4) + 'abcd';
    const verification = await faceService.verifyFaceChallenge(tampered);
    assert.strictEqual(verification.valid, false, 'Tampered token should be rejected');
  });

  it('should reject a malformed/nonexistent token before touching the database', async () => {
    const verification = await faceService.verifyFaceChallenge('not-a-real-token');
    assert.strictEqual(verification.valid, false);
    assert.strictEqual(verification.reason, 'MALFORMED_CHALLENGE_TOKEN');
  });

  it('should enforce single-use challenge token and reject replay attempts', async () => {
    const challenge = faceService.generateFaceChallenge();
    const firstUse = await faceService.verifyFaceChallenge(challenge.challengeToken);
    assert.strictEqual(firstUse.valid, true, 'First verification should succeed');

    const replayAttempt = await faceService.verifyFaceChallenge(challenge.challengeToken);
    assert.strictEqual(replayAttempt.valid, false, 'Second verification of same token must fail');
    assert.strictEqual(replayAttempt.reason, 'CHALLENGE_ALREADY_USED');
  });

  it('should calculate cosine similarity accurately', () => {
    const v1 = [0.1, 0.2, 0.3, 0.4, 0.5];
    const v2 = [0.1, 0.2, 0.3, 0.4, 0.5];
    const v3 = [-0.1, -0.2, -0.3, -0.4, -0.5];

    const simIdentical = faceService.calculateCosineSimilarity(v1, v2);
    assert.ok(Math.abs(simIdentical - 1.0) < 0.0001, 'Identical vectors should have similarity ~1.0');

    const simOpposite = faceService.calculateCosineSimilarity(v1, v3);
    assert.ok(Math.abs(simOpposite - (-1.0)) < 0.0001, 'Opposite vectors should have similarity ~ -1.0');
  });

  it('should validate face vector format', () => {
    const validVector = new Array(128).fill(0.05);
    const validRes = faceService.validateFaceVector(validVector);
    assert.strictEqual(validRes.valid, true);

    const tooShort = [0.1, 0.2];
    const invalidRes = faceService.validateFaceVector(tooShort);
    assert.strictEqual(invalidRes.valid, false);

    const nonNumbers = ['a', 'b', 'c'];
    const invalidRes2 = faceService.validateFaceVector(nonNumbers);
    assert.strictEqual(invalidRes2.valid, false);
  });

  it('should synthesize multi-sample face vectors into normalized template', () => {
    const s1 = new Array(128).fill(0.08);
    const s2 = new Array(128).fill(0.09);
    const s3 = new Array(128).fill(0.085);

    const result = faceService.synthesizeEnrolledTemplate([s1, s2, s3]);
    assert.strictEqual(result.template.length, 128);
    assert.strictEqual(result.samplesCount, 3);
    assert.ok(result.qualityScore >= 0.9, 'Quality score should reflect multi-sample confidence');

    // Check L2 unit norm
    let sumSq = 0;
    for (const val of result.template) sumSq += val * val;
    assert.ok(Math.abs(sumSq - 1.0) < 0.001, 'Synthesized template must have L2 unit norm ~1.0');
  });

  it('should perform 1:1 verification against a single known template only', () => {
    const enrolledTemplate = new Array(128).fill(0.088);
    const closeLiveSample = new Array(128).fill(0.087);
    const farLiveSample = new Array(128).fill(0.088).map((v, i) => (i % 2 === 0 ? -v : v));

    const matchResult = faceService.verifyOneToOne(closeLiveSample, enrolledTemplate, 0.7);
    assert.strictEqual(matchResult.matched, true);
    assert.ok(matchResult.similarity > 0.95);

    const noMatchResult = faceService.verifyOneToOne(farLiveSample, enrolledTemplate, 0.7);
    assert.strictEqual(noMatchResult.matched, false);
  });

  it('should verify a valid BLINK liveness signal (luminance dip in the middle frame)', () => {
    const result = faceService.verifyLivenessSignal('BLINK', [
      { eyeStripMean: 120, gradientCentroidX: 0.5 },
      { eyeStripMean: 95, gradientCentroidX: 0.5 }, // ~21% dip
      { eyeStripMean: 118, gradientCentroidX: 0.5 },
    ]);
    assert.strictEqual(result.valid, true);
  });

  it('should reject a BLINK signal with no meaningful luminance dip', () => {
    const result = faceService.verifyLivenessSignal('BLINK', [
      { eyeStripMean: 120, gradientCentroidX: 0.5 },
      { eyeStripMean: 119, gradientCentroidX: 0.5 },
      { eyeStripMean: 121, gradientCentroidX: 0.5 },
    ]);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'LIVENESS_ACTION_NOT_DETECTED');
  });

  it('should verify a valid TURN_LEFT liveness signal (centroid shift)', () => {
    const result = faceService.verifyLivenessSignal('TURN_LEFT', [
      { eyeStripMean: 120, gradientCentroidX: 0.55 },
      { eyeStripMean: 120, gradientCentroidX: 0.5 },
      { eyeStripMean: 120, gradientCentroidX: 0.4 },
    ]);
    assert.strictEqual(result.valid, true);
  });

  it('should reject malformed liveness signal shapes', () => {
    const result = faceService.verifyLivenessSignal('BLINK', [{ eyeStripMean: 1, gradientCentroidX: 1 }]);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.reason, 'INVALID_LIVENESS_SIGNAL_SHAPE');
  });
});

describe('Encryption Service Tests', () => {
  it('should round-trip encrypt/decrypt a biometric template', () => {
    const template = new Array(128).fill(0).map((_, i) => parseFloat((Math.sin(i) * 0.1).toFixed(6)));
    const blob = encryptionService.encryptTemplate(template);

    assert.ok(blob.iv && blob.ciphertext && blob.authTag && blob.keyVersion);

    const decrypted = encryptionService.decryptTemplate(blob);
    assert.deepStrictEqual(decrypted, template);
  });

  it('should fail safe when the ciphertext is tampered with', () => {
    const template = new Array(128).fill(0.01);
    const blob = encryptionService.encryptTemplate(template);

    const tamperedBlob = { ...blob, ciphertext: Buffer.from('tampered-ciphertext').toString('base64') };
    assert.throws(() => encryptionService.decryptTemplate(tamperedBlob));
  });

  it('should fail safe when the auth tag is tampered with', () => {
    const template = new Array(128).fill(0.02);
    const blob = encryptionService.encryptTemplate(template);

    const tamperedBlob = { ...blob, authTag: Buffer.from('0'.repeat(16)).toString('base64') };
    assert.throws(() => encryptionService.decryptTemplate(tamperedBlob));
  });

  it('should reject an incomplete encrypted blob', () => {
    assert.throws(() => encryptionService.decryptTemplate({ iv: 'x' }));
  });
});

describe('Mongo Rate Limit Store Tests', () => {
  it('should atomically count concurrent increments with no lost updates', async () => {
    const store = new MongoRateLimitStore('concurrency-test');
    store.init({ windowMs: 60 * 1000 });

    const key = `concurrency-${Date.now()}`;
    const CONCURRENT_REQUESTS = 20;

    await Promise.all(Array.from({ length: CONCURRENT_REQUESTS }, () => store.increment(key)));

    const finalCount = await RateLimitCounter.findOne({ key: store.keyFor(key) });
    assert.strictEqual(
      finalCount.totalHits,
      CONCURRENT_REQUESTS,
      'Every concurrent increment must be counted exactly once — no race-condition lost updates'
    );
  });

  it('should reset the window after it expires', async () => {
    const store = new MongoRateLimitStore('expiry-test');
    store.init({ windowMs: 50 }); // very short window for the test

    const key = `expiry-${Date.now()}`;
    await store.increment(key);
    await store.increment(key);

    await new Promise((resolve) => setTimeout(resolve, 80));

    const result = await store.increment(key);
    assert.strictEqual(result.totalHits, 1, 'Counter should reset once the previous window has expired');
  });
});

describe('Token Service Tests', () => {
  it('should hash plain tokens consistently', () => {
    const token = 'sample_token_12345';
    const hash1 = tokenService.hashToken(token);
    const hash2 = tokenService.hashToken(token);
    assert.strictEqual(hash1, hash2, 'Hashes of identical strings must match');
    assert.strictEqual(typeof hash1, 'string');
    assert.strictEqual(hash1.length, 64, 'SHA-256 hex output must be 64 characters');
  });
});
