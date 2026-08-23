const crypto = require('crypto');
const env = require('../config/env');

const errorHandler = (err, req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();

  // Log error with request ID for backend auditing
  console.error(`[Error ${requestId}] ${req.method} ${req.originalUrl}:`, err);

  // Mongoose duplicate key error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_RESOURCE',
      message: `An account with this ${field} already exists.`,
      requestId,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: messages[0] || 'Invalid input data.',
      errors: messages,
      requestId,
    });
  }

  // CastError (Invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: 'Invalid resource ID provided.',
      requestId,
    });
  }

  // Default internal server error (never leak internal trace to client)
  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.isOperational ? err.message : 'An unexpected error occurred. Please try again.',
    requestId,
    ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};

module.exports = errorHandler;
