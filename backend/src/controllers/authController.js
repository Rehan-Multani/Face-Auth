const crypto = require('crypto');
const User = require('../models/User');
const BiometricCredential = require('../models/BiometricCredential');
const AuditLog = require('../models/AuditLog');
const tokenService = require('../services/tokenService');
const faceService = require('../services/faceService');
const encryptionService = require('../services/encryption.service');
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
 * Also returns a randomized active-liveness action the client must perform
 * and prove during capture (see faceService.verifyLivenessSignal).
 */
const getFaceChallenge = async (req, res, next) => {
  try {
    const challenge = faceService.generateFaceChallenge();
    return res.status(200).json({
      success: true,
      challengeId: challenge.challengeId,
      challengeToken: challenge.challengeToken,
      livenessAction: challenge.livenessAction,
      expiresInMs: challenge.expiresInMs,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enroll / Register Face Biometrics (Protected)
 * Binds the resulting credential to a device identifier so that face-login
 * can look it up with a single indexed query instead of a 1:N scan.
 */
const enrollFace = async (req, res, next) => {
  try {
    const { challengeToken, faceDescriptor, samples, deviceId, frameSignals, metadata = {} } = req.body;

    // Verify and consume single-use challenge token
    const verification = await faceService.verifyFaceChallenge(challengeToken);
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

    // Verify the active-liveness action was actually performed (server-side
    // signal check — never trust a client-provided "livenessPassed" boolean)
    const livenessResult = faceService.verifyLivenessSignal(verification.livenessAction, frameSignals);
    if (!livenessResult.valid) {
      await AuditLog.create({
        userId: req.user._id,
        eventType: 'LIVENESS_FAILED',
        success: false,
        failureReason: livenessResult.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
      });

      return res.status(400).json({
        success: false,
        code: 'LIVENESS_CHECK_FAILED',
        message: 'We could not verify a live face. Please follow the on-screen instruction and try again.',
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

    const boundDeviceId =
      typeof deviceId === 'string' && deviceId.length > 0
        ? deviceId
        : crypto.randomBytes(24).toString('hex');

    const templateEncrypted = encryptionService.encryptTemplate(synthesized.template);

    // Revoke any existing active credentials for this user (any device) and
    // for this device (any user) — a device or a user identity can only be
    // bound to one active credential at a time, enforced at the DB layer by
    // a partial unique index on { deviceId, status: 'active' }.
    await BiometricCredential.updateMany(
      { $or: [{ user: user._id, status: 'active' }, { deviceId: boundDeviceId, status: 'active' }] },
      { status: 'revoked' }
    );

    // Create fresh dedicated BiometricCredential
    const credential = await BiometricCredential.create({
      user: user._id,
      deviceId: boundDeviceId,
      templateEncrypted,
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
      deviceId: boundDeviceId,
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
 * Device-Bound 1:1 Face Authentication
 * Looks up the single active credential for the caller's deviceId (an
 * indexed point query) and verifies the live sample against only that
 * credential — no collection-wide biometric scan.
 */
const verifyFaceLogin = async (req, res, next) => {
  try {
    const { challengeToken, faceDescriptor, deviceId, frameSignals } = req.body;

    // Verify and consume single-use anti-replay challenge
    const verification = await faceService.verifyFaceChallenge(challengeToken);
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

    const livenessResult = faceService.verifyLivenessSignal(verification.livenessAction, frameSignals);
    if (!livenessResult.valid) {
      await AuditLog.create({
        eventType: 'LIVENESS_FAILED',
        success: false,
        failureReason: livenessResult.reason,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id'],
      });

      return res.status(400).json({
        success: false,
        code: 'LIVENESS_CHECK_FAILED',
        message: 'We could not verify a live face. Please follow the on-screen instruction and try again.',
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

    // Indexed 1:1 lookup — the ONLY credential this request is ever compared against
    const credential = await BiometricCredential.findOne({ deviceId, status: 'active' })
      .select('+templateEncrypted')
      .populate('user');

    if (!credential || !credential.user) {
      await AuditLog.create({
        eventType: 'FACE_AUTH_FAILED',
        success: false,
        failureReason: 'DEVICE_NOT_ENROLLED',
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

    const matchedUser = credential.user;

    // Validate account status
    if (matchedUser.status !== 'active') {
      await AuditLog.create({
        userId: matchedUser._id,
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

    // Decrypt only this one credential's template. Fails safe: a
    // tampered/corrupted encrypted blob throws here rather than matching.
    let decryptedTemplate;
    try {
      decryptedTemplate = encryptionService.decryptTemplate(credential.templateEncrypted);
    } catch {
      await AuditLog.create({
        userId: matchedUser._id,
        eventType: 'FACE_AUTH_FAILED',
        success: false,
        failureReason: 'TEMPLATE_DECRYPT_FAILED',
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

    const threshold = env.FACE_SIMILARITY_THRESHOLD;
    const matchResult = faceService.verifyOneToOne(faceDescriptor, decryptedTemplate, threshold);

    if (!matchResult.matched) {
      await AuditLog.create({
        userId: matchedUser._id,
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

    // Update credential & user activity
    credential.lastAuthenticatedAt = new Date();
    await credential.save();

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
      matchConfidence: parseFloat((matchResult.similarity * 100).toFixed(1)),
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
 * Disables the credential for the caller's current device by default; pass
 * an explicit deviceId to target a different enrolled device.
 */
const disableFaceAuth = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { deviceId } = req.body;

    const filter =
      typeof deviceId === 'string' && deviceId.length > 0
        ? { user: userId, deviceId, status: 'active' }
        : { user: userId, status: 'active' };

    await BiometricCredential.updateMany(filter, { status: 'disabled' });

    const remainingActive = await BiometricCredential.exists({ user: userId, status: 'active' });

    const user = await User.findById(userId);
    if (user) {
      user.isFaceRegistered = !!remainingActive;
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

