const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const RefreshToken = require('../models/RefreshToken');

/**
 * Hash a plain token using SHA-256 for secure database storage
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate a short-lived access token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      isFaceRegistered: !!user.isFaceRegistered,
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      algorithm: 'HS256',
    }
  );
};

/**
 * Generate a cryptographically secure opaque refresh token and persist its hash
 */
const generateRefreshToken = async (user, reqInfo = {}) => {
  const plainToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(plainToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRES_IN_DAYS);

  await RefreshToken.create({
    user: user._id,
    tokenHash,
    expiresAt,
    ipAddress: reqInfo.ip || '',
    userAgent: reqInfo.userAgent || '',
  });

  return { plainToken, expiresAt };
};

/**
 * Verify and rotate a refresh token
 */
const rotateRefreshToken = async (oldPlainToken, user, reqInfo = {}) => {
  const oldTokenHash = hashToken(oldPlainToken);
  const existingRecord = await RefreshToken.findOne({
    tokenHash: oldTokenHash,
    user: user._id,
  });

  if (!existingRecord) {
    throw new Error('REFRESH_TOKEN_NOT_FOUND');
  }

  if (existingRecord.isRevoked) {
    // Possible token reuse attack! Revoke all tokens for this user
    await RefreshToken.updateMany({ user: user._id }, { isRevoked: true });
    throw new Error('REFRESH_TOKEN_REUSED');
  }

  if (existingRecord.expiresAt < new Date()) {
    throw new Error('REFRESH_TOKEN_EXPIRED');
  }

  // Issue new refresh token
  const newPlainToken = crypto.randomBytes(40).toString('hex');
  const newTokenHash = hashToken(newPlainToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_EXPIRES_IN_DAYS);

  // Mark old token as revoked and replaced
  existingRecord.isRevoked = true;
  existingRecord.replacedByTokenHash = newTokenHash;
  await existingRecord.save();

  // Create new active token
  await RefreshToken.create({
    user: user._id,
    tokenHash: newTokenHash,
    expiresAt,
    ipAddress: reqInfo.ip || '',
    userAgent: reqInfo.userAgent || '',
  });

  const accessToken = generateAccessToken(user);

  return {
    accessToken,
    refreshToken: newPlainToken,
    expiresAt,
  };
};

/**
 * Revoke a refresh token on logout
 */
const revokeRefreshToken = async (plainToken) => {
  if (!plainToken) return;
  const tokenHash = hashToken(plainToken);
  await RefreshToken.updateOne({ tokenHash }, { isRevoked: true });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  hashToken,
};
