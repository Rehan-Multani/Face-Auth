const mongoose = require('mongoose');

const biometricCredentialSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Opaque server-issued device identifier (association/lookup key only —
    // not a signed credential; see deviceIdentity in the biometric hardening plan).
    deviceId: {
      type: String,
      required: true,
      index: true,
    },
    // AES-256-GCM encrypted 128-dimensional biometric embedding template.
    // Never stored in plaintext; never returned in queries or APIs by default.
    templateEncrypted: {
      type: {
        iv: { type: String, required: true },
        ciphertext: { type: String, required: true },
        authTag: { type: String, required: true },
        keyVersion: { type: String, required: true },
      },
      required: true,
      select: false,
      _id: false,
    },
    version: {
      type: String,
      default: 'v1.0',
    },
    status: {
      type: String,
      enum: ['active', 'disabled', 'revoked'],
      default: 'active',
      index: true,
    },
    qualityScore: {
      type: Number,
      default: 1.0,
      min: 0,
      max: 1,
    },
    samplesCount: {
      type: Number,
      default: 1,
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    lastAuthenticatedAt: {
      type: Date,
    },
    metadata: {
      deviceModel: { type: String, default: '' },
      ipAddress: { type: String, default: '' },
      userAgent: { type: String, default: '' },
      livenessPassed: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.templateEncrypted; // Never expose the encrypted template in JSON serialization
        delete ret.__v;
        return ret;
      },
    },
  }
);

// One active credential per device: DB-level invariant backing the 1:1
// device-bound lookup (also enforces at the data layer, not just in
// application code, that a device can't end up with two active credentials).
biometricCredentialSchema.index(
  { deviceId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

// Compound index for per-user credential management (enroll/disable/list).
biometricCredentialSchema.index({ status: 1, user: 1 });

const BiometricCredential = mongoose.model('BiometricCredential', biometricCredentialSchema);
module.exports = BiometricCredential;
