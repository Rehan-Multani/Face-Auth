const express = require('express');
const crypto = require('crypto');
const connectDB = require('./config/db');
const { configureSecurity, sanitizeBody } = require('./middleware/security');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Trust reverse proxy (Vercel, AWS Lambda, Cloudflare, etc.)
app.set('trust proxy', 1);

// Request ID middleware for request tracking
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.headers['x-request-id']);
  next();
});


// Configure Helmet & CORS
configureSecurity(app);

// Request body parsers with strict size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Sanitize inputs (NoSQL injection defense)
app.use(sanitizeBody);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'Face Auth Backend API',
    status: 'online',
    healthCheck: '/api/health',
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    res.status(200).json({
      status: 'UP',
      database: 'CONNECTED',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      status: 'DEGRADED',
      database: 'DISCONNECTED',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Auto-connect to database for API routes (Serverless / Vercel execution)
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[DB Middleware Error]', err.message);
    return res.status(500).json({
      success: false,
      code: 'DB_CONNECTION_ERROR',
      message: 'Database connection failed. Please ensure MongoDB URI and Network Access are configured correctly.',
    });
  }
});

// General rate limiter for all API routes
app.use('/api', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handling
app.use(errorHandler);

module.exports = app;

