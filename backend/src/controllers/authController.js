const User = require('../models/User');
const BiometricCredential = require('../models/BiometricCredential');
const AuditLog = require('../models/AuditLog');
const tokenService = require('../services/tokenService');
const faceService = require('../services/faceService');
const env = require('../config/env');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_TIME_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Register a new user
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email address already exists.',
      });
    }

    const user = await User.create({
      name,
      email,
      password,
    });

    const accessToken = tokenService.generateAccessToken(user);
    const { plainToken: refreshToken } = await tokenService.generateRefreshToken(user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isFaceRegistered: false,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Password Login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select(
      '+password +failedLoginAttempts +lockUntil +status'
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_SUSPENDED',
        message: 'This account has been suspended.',
      });
    }

    // Check account lockout
    if (user.isLocked()) {
      const remainingMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: `Account is temporarily locked. Try again in ${remainingMinutes} minutes.`,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCK_TIME_MS);
      }
      await user.save();

      return res.status(401).json({
        success: false,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Reset failed attempts & update login time
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();

    const accessToken = tokenService.generateAccessToken(user);
    const { plainToken: refreshToken } = await tokenService.generateRefreshToken(user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isFaceRegistered: user.isFaceRegistered,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate Anti-Replay Face Authentication Challenge Token
 */
const getFaceChallenge = async (req, res, next) => {
  try {
    const challenge = faceService.generateFaceChallenge();
    return res.status(200).json({
      success: true,
      challengeId: challenge.challengeId,
      challengeToken: challenge.challengeToken,
      expiresInMs: challenge.expiresInMs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enroll / Register Face Biometrics (Protected)
 */
const enrollFace = async (req, res, next) => {
  try {
    const { challengeToken, faceDescriptor, samples, metadata = {} } = req.body;

    // Verify and consume single-use challenge token
    const verification = faceService.verifyFaceChallenge(challengeToken);
    if (!verification.valid) {
      await AuditLog.create({
        userId: req.user._id,
        eventType: verification.reason === 'CHALLENGE_ALREADY_USED' ? 'CHALLENGE_REPLAY_DETECTED' : 'FACE_ENROLL_FAILED',
        success: false,
        failureReason: verification.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
      });

      return res.status(400).json({
        success: false,
        code: 'CHALLENGE_FAILED',
        message: 'Face security challenge failed or expired. Please try again.',
      });
    }

    const inputSamples = samples && Array.isArray(samples) && samples.length > 0 ? samples : [faceDescriptor];
    let synthesized;
    try {
      synthesized = faceService.synthesizeEnrolledTemplate(inputSamples);
    } catch (synthErr) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_BIOMETRIC_DATA',
        message: synthErr.message || 'Invalid face biometric descriptor provided.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User account not found.',
      });
    }

    // Revoke any existing active credentials for this user
    await BiometricCredential.updateMany(
      { user: user._id, status: 'active' },
      { status: 'revoked' }
    );

    // Create fresh dedicated BiometricCredential
    const credential = await BiometricCredential.create({
      user: user._id,
      template: synthesized.template,
      qualityScore: synthesized.qualityScore,
      samplesCount: synthesized.samplesCount,
      version: 'v1.0',
      status: 'active',
      enrolledAt: new Date(),
      metadata: {
        deviceModel: metadata.deviceModel || '',
        ipAddress: req.ip || '',
        userAgent: req.headers['user-agent'] || '',
        livenessPassed: true,
      },
    });

    user.isFaceRegistered = true;
    user.faceRegisteredAt = new Date();
    await user.save();

    // Audit log
    await AuditLog.create({
      userId: user._id,
      eventType: 'FACE_ENROLL_COMPLETED',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.headers['x-request-id'],
    });

    return res.status(200).json({
      success: true,
      message: 'Face biometric successfully enrolled.',
      credentialId: credential._id,
      qualityScore: credential.qualityScore,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        isFaceRegistered: true,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 1:N Zero-Credential Face Authentication
 * Identifies registered user directly from live camera embedding
 */
const verifyFaceLogin = async (req, res, next) => {
  try {
    const { challengeToken, faceDescriptor } = req.body;

    // Verify and consume single-use anti-replay challenge
    const verification = faceService.verifyFaceChallenge(challengeToken);
    if (!verification.valid) {
      await AuditLog.create({
        eventType: verification.reason === 'CHALLENGE_ALREADY_USED' ? 'CHALLENGE_REPLAY_DETECTED' : 'FACE_AUTH_FAILED',
        success: false,
        failureReason: verification.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
      });

      return res.status(400).json({
        success: false,
        code: 'CHALLENGE_FAILED',
        message: 'Face security challenge failed or expired. Please try again.',
      });
    }

    const vectorValidation = faceService.validateFaceVector(faceDescriptor);
    if (!vectorValidation.valid) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_BIOMETRIC_DATA',
        message: vectorValidation.message,
      });
    }

    // Retrieve all active biometric credentials
    const activeCredentials = await BiometricCredential.find({ status: 'active' })
      .select('+template')
      .populate('user');

    const threshold = env.FACE_SIMILARITY_THRESHOLD; // e.g. 0.70
    const candidates = faceService.rankCandidates(faceDescriptor, activeCredentials, threshold);

    if (candidates.length === 0) {
      await AuditLog.create({
        eventType: 'FACE_AUTH_FAILED',
        success: false,
        failureReason: 'NO_MATCHING_BIOMETRIC',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
      });

      return res.status(401).json({
        success: false,
        code: 'FACE_NOT_RECOGNIZED',
        message: 'Face not recognized. Please try again or use password login.',
      });
    }

    // Select top candidate
    const topMatch = candidates[0];
    const matchedUser = topMatch.user;
    const matchedCredential = topMatch.credential;

    // Validate account status
    if (!matchedUser || matchedUser.status !== 'active') {
      await AuditLog.create({
        userId: matchedUser ? matchedUser._id : null,
        eventType: 'FACE_AUTH_FAILED',
        success: false,
        failureReason: 'ACCOUNT_SUSPENDED_OR_MISSING',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
      });

      return res.status(403).json({
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is inactive or suspended.',
      });
    }

    // Update credential & user activity
    matchedCredential.lastAuthenticatedAt = new Date();
    await matchedCredential.save();

    matchedUser.lastLoginAt = new Date();
    matchedUser.failedLoginAttempts = 0;
    matchedUser.lockUntil = undefined;
    await matchedUser.save();

    // Audit log success
    await AuditLog.create({
      userId: matchedUser._id,
      eventType: 'FACE_AUTH_SUCCESS',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.headers['x-request-id'],
    });

    const accessToken = tokenService.generateAccessToken(matchedUser);
    const { plainToken: refreshToken } = await tokenService.generateRefreshToken(matchedUser, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({
      success: true,
      message: 'Face authentication successful.',
      matchConfidence: parseFloat((topMatch.similarity * 100).toFixed(1)),
      user: {
        id: matchedUser._id,
        name: matchedUser.name,
        email: matchedUser.email,
        isFaceRegistered: true,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Disable Face Biometric Authentication (Protected)
 */
const disableFaceAuth = async (req, res, next) => {
  try {
    const userId = req.user._id;

    await BiometricCredential.updateMany(
      { user: userId, status: 'active' },
      { status: 'disabled' }
    );

    const user = await User.findById(userId);
    if (user) {
      user.isFaceRegistered = false;
      await user.save();
    }

    await AuditLog.create({
      userId,
      eventType: 'FACE_CREDENTIAL_DISABLED',
      success: true,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.headers['x-request-id'],
    });

    return res.status(200).json({
      success: true,
      message: 'Face biometric authentication disabled successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh Access Token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: incomingToken } = req.body;

    if (!incomingToken || typeof incomingToken !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'MISSING_REFRESH_TOKEN',
        message: 'Refresh token is required.',
      });
    }

    const tokenHash = tokenService.hashToken(incomingToken);
    const RefreshToken = require('../models/RefreshToken');
    const existingRecord = await RefreshToken.findOne({ tokenHash }).populate('user');

    if (!existingRecord || !existingRecord.user) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Invalid or expired session. Please login again.',
      });
    }

    const rotated = await tokenService.rotateRefreshToken(incomingToken, existingRecord.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({
      success: true,
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
    });
  } catch (error) {
    if (error.message === 'REFRESH_TOKEN_REUSED' || error.message === 'REFRESH_TOKEN_EXPIRED') {
      return res.status(401).json({
        success: false,
        code: error.message,
        message: 'Session has expired or was revoked. Please log in again.',
      });
    }
    next(error);
  }
};

/**
 * Logout & Revoke Refresh Token
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken: incomingToken } = req.body;
    if (incomingToken) {
      await tokenService.revokeRefreshToken(incomingToken);
    }

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Current User Profile (Protected)
 */
const getMe = async (req, res, next) => {
  try {
    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        isFaceRegistered: req.user.isFaceRegistered,
        faceRegisteredAt: req.user.faceRegisteredAt,
        status: req.user.status,
        lastLoginAt: req.user.lastLoginAt,
        createdAt: req.user.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getFaceChallenge,
  enrollFace,
  verifyFaceLogin,
  disableFaceAuth,
  refreshToken,
  logout,
  getMe,
};

