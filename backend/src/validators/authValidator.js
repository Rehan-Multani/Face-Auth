const validator = require('validator');
const { validateFaceVector } = require('../services/faceService');

const validateRegister = (req, res, next) => {
  const { name, email, password } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_NAME',
      message: 'Name is required and must be at least 2 characters long.',
    });
  }

  if (!email || typeof email !== 'string' || !validator.isEmail(email)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_EMAIL',
      message: 'A valid email address is required.',
    });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({
      success: false,
      code: 'WEAK_PASSWORD',
      message: 'Password must be at least 8 characters long.',
    });
  }

  req.body.name = name.trim();
  req.body.email = email.trim().toLowerCase();
  next();
};

const validateLogin = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !validator.isEmail(email)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_EMAIL',
      message: 'A valid email address is required.',
    });
  }

  if (!password || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_PASSWORD',
      message: 'Password is required.',
    });
  }

  req.body.email = email.trim().toLowerCase();
  next();
};

const DEVICE_ID_REGEX = /^[a-f0-9]{16,64}$/i;

const validateFrameSignals = (frameSignals) => {
  if (!Array.isArray(frameSignals) || frameSignals.length !== 3) {
    return false;
  }
  return frameSignals.every(
    (frame) =>
      frame &&
      typeof frame.eyeStripMean === 'number' &&
      typeof frame.gradientCentroidX === 'number' &&
      isFinite(frame.eyeStripMean) &&
      isFinite(frame.gradientCentroidX)
  );
};

const validateFaceEnroll = (req, res, next) => {
  const { challengeToken, faceDescriptor, deviceId, frameSignals } = req.body;

  if (!challengeToken || typeof challengeToken !== 'string') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_CHALLENGE',
      message: 'Challenge token is required for face enrollment.',
    });
  }

  if (deviceId !== undefined && (typeof deviceId !== 'string' || !DEVICE_ID_REGEX.test(deviceId))) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_DEVICE_ID',
      message: 'Provided device identifier is invalid.',
    });
  }

  if (!validateFrameSignals(frameSignals)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_LIVENESS_SIGNAL',
      message: 'Liveness capture data is missing or malformed. Please try again.',
    });
  }

  const vectorValidation = validateFaceVector(faceDescriptor);
  if (!vectorValidation.valid) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_FACE_DESCRIPTOR',
      message: vectorValidation.message,
    });
  }

  next();
};

const validateFaceVerify = (req, res, next) => {
  const { challengeToken, faceDescriptor, deviceId, frameSignals } = req.body;

  if (!challengeToken || typeof challengeToken !== 'string') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_CHALLENGE',
      message: 'Challenge token is required for face authentication.',
    });
  }

  if (!deviceId || typeof deviceId !== 'string' || !DEVICE_ID_REGEX.test(deviceId)) {
    return res.status(400).json({
      success: false,
      code: 'MISSING_DEVICE_ID',
      message: 'This device is not set up for face login.',
    });
  }

  if (!validateFrameSignals(frameSignals)) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_LIVENESS_SIGNAL',
      message: 'Liveness capture data is missing or malformed. Please try again.',
    });
  }

  const vectorValidation = validateFaceVector(faceDescriptor);
  if (!vectorValidation.valid) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_FACE_DESCRIPTOR',
      message: vectorValidation.message,
    });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateFaceEnroll,
  validateFaceVerify,
};
