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

const validateFaceEnroll = (req, res, next) => {
  const { challengeToken, faceDescriptor } = req.body;

  if (!challengeToken || typeof challengeToken !== 'string') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_CHALLENGE',
      message: 'Challenge token is required for face enrollment.',
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
  const { challengeToken, faceDescriptor, email } = req.body;

  if (!challengeToken || typeof challengeToken !== 'string') {
    return res.status(400).json({
      success: false,
      code: 'MISSING_CHALLENGE',
      message: 'Challenge token is required for face authentication.',
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

  if (email) {
    if (typeof email !== 'string' || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        code: 'INVALID_EMAIL',
        message: 'Provided email is not valid.',
      });
    }
    req.body.email = email.trim().toLowerCase();
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateFaceEnroll,
  validateFaceVerify,
};
