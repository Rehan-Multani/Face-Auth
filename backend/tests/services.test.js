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
