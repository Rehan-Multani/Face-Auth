const User = require('../models/User');
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
 * Generate anti-replay Face Challenge Token
 */
const getFaceChallenge = async (req, res, next) => {
  try {
    const challenge = faceService.generateFaceChallenge();
    return res.status(200).json({
      success: true,
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
    const { challengeToken, faceDescriptor } = req.body;

    const verification = faceService.verifyFaceChallenge(challengeToken);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        code: 'CHALLENGE_FAILED',
        message: 'Face security challenge failed or expired. Please try again.',
      });
    }

    // Attach descriptor to authenticated user
    const user = await User.findById(req.user._id).select('+faceDescriptor');
    if (!user) {
      return res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User account not found.',
      });
    }

    user.faceDescriptor = faceDescriptor;
    user.isFaceRegistered = true;
    user.faceRegisteredAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Face biometric successfully enrolled.',
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
 * Face Authentication / Login
 */
const verifyFaceLogin = async (req, res, next) => {
  try {
    const { challengeToken, faceDescriptor, email } = req.body;

    const verification = faceService.verifyFaceChallenge(challengeToken);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        code: 'CHALLENGE_FAILED',
        message: 'Face security challenge failed or expired. Please try again.',
      });
    }

    let matchedUser = null;
    const threshold = env.FACE_SIMILARITY_THRESHOLD; // e.g. 0.55 similarity or distance check

    if (email) {
      // 1:1 Face Verification
      const candidateUser = await User.findOne({
        email,
        isFaceRegistered: true,
        status: 'active',
      }).select('+faceDescriptor');

      if (candidateUser && candidateUser.faceDescriptor && candidateUser.faceDescriptor.length > 0) {
        const similarity = faceService.calculateCosineSimilarity(
          faceDescriptor,
          candidateUser.faceDescriptor
        );
        if (similarity >= threshold) {
          matchedUser = candidateUser;
        }
      }
    } else {
      // 1:N Face Recognition against registered active users
      const users = await User.find({
        isFaceRegistered: true,
        status: 'active',
      }).select('+faceDescriptor');

      let highestSimilarity = -1;

      for (const candidate of users) {
        if (candidate.faceDescriptor && candidate.faceDescriptor.length > 0) {
          const similarity = faceService.calculateCosineSimilarity(
            faceDescriptor,
            candidate.faceDescriptor
          );
          if (similarity > highestSimilarity && similarity >= threshold) {
            highestSimilarity = similarity;
            matchedUser = candidate;
          }
        }
      }
    }

    if (!matchedUser) {
      return res.status(401).json({
        success: false,
        code: 'FACE_NOT_RECOGNIZED',
        message: 'Face not recognized. Please retry or login with email and password.',
      });
    }

    matchedUser.lastLoginAt = new Date();
    await matchedUser.save();

    const accessToken = tokenService.generateAccessToken(matchedUser);
    const { plainToken: refreshToken } = await tokenService.generateRefreshToken(matchedUser, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return res.status(200).json({
      success: true,
      message: 'Face authentication successful.',
      user: {
        id: matchedUser._id,
        name: matchedUser.name,
        email: matchedUser.email,
        isFaceRegistered: matchedUser.isFaceRegistered,
      },
      accessToken,
      refreshToken,
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
  refreshToken,
  logout,
  getMe,
};
