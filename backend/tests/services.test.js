const { describe, it } = require('node:test');
const assert = require('node:assert');
const faceService = require('../src/services/faceService');
const tokenService = require('../src/services/tokenService');

describe('Face Service Tests', () => {
  it('should generate a valid challenge token and verify it', () => {
    const challenge = faceService.generateFaceChallenge();
    assert.ok(challenge.challengeToken, 'Challenge token should be defined');

    const verification = faceService.verifyFaceChallenge(challenge.challengeToken);
    assert.strictEqual(verification.valid, true, 'Fresh challenge token should be valid');
  });

  it('should reject tampered challenge token', () => {
    const challenge = faceService.generateFaceChallenge();
    const tampered = challenge.challengeToken.slice(0, -4) + 'abcd';
    const verification = faceService.verifyFaceChallenge(tampered);
    assert.strictEqual(verification.valid, false, 'Tampered token should be rejected');
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

  it('should enforce single-use challenge token and reject replay attempts', () => {
    const challenge = faceService.generateFaceChallenge();
    const firstUse = faceService.verifyFaceChallenge(challenge.challengeToken);
    assert.strictEqual(firstUse.valid, true, 'First verification should succeed');

    const replayAttempt = faceService.verifyFaceChallenge(challenge.challengeToken);
    assert.strictEqual(replayAttempt.valid, false, 'Second verification of same token must fail');
    assert.strictEqual(replayAttempt.reason, 'CHALLENGE_ALREADY_USED');
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

  it('should accurately rank candidates in 1:N biometric search', () => {
    const targetVector = new Array(128).fill(0.088);
    const similarVector = new Array(128).fill(0.087);
    const differentVector = new Array(128).fill(0.088).map((v, i) => (i % 2 === 0 ? -v : v));

    const candidates = [
      { id: '1', user: { name: 'User Different' }, template: differentVector },
      { id: '2', user: { name: 'User Target' }, template: similarVector },
    ];

    const ranked = faceService.rankCandidates(targetVector, candidates, 0.70);
    assert.strictEqual(ranked.length, 1, 'Only candidates meeting threshold should match');
    assert.strictEqual(ranked[0].user.name, 'User Target');
    assert.ok(ranked[0].similarity > 0.95);
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
