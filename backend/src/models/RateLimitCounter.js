const mongoose = require('mongoose');

/**
 * Fixed-window rate-limit counter, backing a Mongo-based express-rate-limit
 * Store so limits are enforced correctly across ephemeral/multi-instance
 * serverless invocations (an in-memory Map/Store does not survive those).
 */
const rateLimitCounterSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  totalHits: {
    type: Number,
    required: true,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // TTL index: window auto-clears once it lapses
  },
});

const RateLimitCounter = mongoose.model('RateLimitCounter', rateLimitCounterSchema);
module.exports = RateLimitCounter;
