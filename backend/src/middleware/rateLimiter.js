const rateLimit = require('express-rate-limit');
const MongoRateLimitStore = require('./mongoRateLimitStore');

// Strict rate limiter for sensitive authentication endpoints (prevent brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  store: new MongoRateLimitStore('auth'),
  message: {
    success: false,
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many authentication attempts. Please wait 15 minutes before trying again.',
  },
});

// Rate limiter for face challenge requests (prevent token flooding)
const challengeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  store: new MongoRateLimitStore('challenge'),
  message: {
    success: false,
    code: 'TOO_MANY_CHALLENGES',
    message: 'Too many face challenge requests. Please try again in a few moments.',
  },
});

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  store: new MongoRateLimitStore('api'),
  message: {
    success: false,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please slow down.',
  },
});


module.exports = {
  authLimiter,
  challengeLimiter,
  apiLimiter,
};

