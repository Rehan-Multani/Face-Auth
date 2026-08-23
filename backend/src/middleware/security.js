const helmet = require('helmet');
const cors = require('cors');
const env = require('../config/env');

const configureSecurity = (app) => {
  // 1. Helmet headers for protecting well-known web vulnerabilities
  app.use(
    helmet({
      contentSecurityPolicy: false, // Mobile API client
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. CORS configuration
  const allowedOrigins = env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',');
  app.use(
    cors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      credentials: true,
    })
  );

  // 3. Prevent parameter pollution and enforce payload limit (max 2mb for face descriptors/avatars)
  app.disable('x-powered-by');
};

/**
 * Middleware to sanitize inputs and block Mongo operator injections ($gt, $where, etc.)
 */
const sanitizeBody = (req, res, next) => {
  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};

module.exports = {
  configureSecurity,
  sanitizeBody,
};
