const mongoose = require('mongoose');

const biometricCredentialSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Normalized 128-dimensional biometric embedding template
    template: {
      type: [Number],
      required: true,
      select: false, // Never return biometric template in queries or APIs by default
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
        delete ret.template; // Never expose template in JSON serialization
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Fast compound indexes for 1:N biometric search and tenant/status queries
biometricCredentialSchema.index({ status: 1, user: 1 });

const BiometricCredential = mongoose.model('BiometricCredential', biometricCredentialSchema);
module.exports = BiometricCredential;
