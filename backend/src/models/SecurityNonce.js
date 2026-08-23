const mongoose = require('mongoose');

/**
 * Durable, serverless-safe replacement for an in-memory consumed-nonce set.
 * A nonce is "consumed" by successfully inserting it here; a duplicate-key
 * error on insert means the nonce was already used (replay attempt).
 */
const securityNonceSchema = new mongoose.Schema({
  nonce: {
    type: String,
    required: true,
    unique: true,
  },
  purpose: {
    type: String,
    enum: ['face_challenge'],
    default: 'face_challenge',
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // TTL index: Mongo auto-deletes once expiresAt passes
  },
});

const SecurityNonce = mongoose.model('SecurityNonce', securityNonceSchema);
module.exports = SecurityNonce;
