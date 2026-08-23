const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, challengeLimiter } = require('../middleware/rateLimiter');
const {
  validateRegister,
  validateLogin,
  validateFaceEnroll,
  validateFaceVerify,
} = require('../validators/authValidator');

// Public Authentication Endpoints
router.post('/register', authLimiter, validateRegister, authController.register);
router.post('/login', authLimiter, validateLogin, authController.login);
router.post('/refresh', authLimiter, authController.refreshToken);
router.post('/logout', authController.logout);

// Face Biometric Endpoints
router.get('/face/challenge', challengeLimiter, authController.getFaceChallenge);
router.post('/face/verify', authLimiter, validateFaceVerify, authController.verifyFaceLogin);

// Protected Endpoints
router.post(
  '/face/enroll',
  requireAuth,
  authLimiter,
  validateFaceEnroll,
  authController.enrollFace
);
router.get('/me', requireAuth, authController.getMe);

module.exports = router;
