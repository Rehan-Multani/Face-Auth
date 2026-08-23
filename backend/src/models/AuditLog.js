const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        'FACE_ENROLL_STARTED',
        'FACE_ENROLL_COMPLETED',
        'FACE_ENROLL_FAILED',
        'FACE_AUTH_SUCCESS',
        'FACE_AUTH_FAILED',
        'LIVENESS_FAILED',
        'CHALLENGE_EXPIRED',
        'CHALLENGE_REPLAY_DETECTED',
        'FACE_CREDENTIAL_DISABLED',
        'FACE_CREDENTIAL_REPLACED',
      ],
      index: true,
    },
    success: {
      type: Boolean,
      required: true,
    },
    failureReason: {
      type: String,
      default: null,
    },
    ipAddress: {
      type: String,
      default: '',
    },
    userAgent: {
      type: String,
      default: '',
    },
    requestId: {
      type: String,
      default: '',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically prune audit logs after 90 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
