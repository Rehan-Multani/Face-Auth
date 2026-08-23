const dotenv = require('dotenv');
dotenv.config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '5000', 10),
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/face_auth_db',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'dev_jwt_access_secret_change_in_production_987654321',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_jwt_refresh_secret_change_in_production_123456789',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN_DAYS: parseInt(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || '7', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  FACE_SIMILARITY_THRESHOLD: parseFloat(process.env.FACE_SIMILARITY_THRESHOLD || '0.55'),
  BIOMETRIC_ACTIVE_KEY_VERSION: process.env.BIOMETRIC_ACTIVE_KEY_VERSION || 'v1',
};


// Validate critical production requirements
if (env.NODE_ENV === 'production') {
  if (env.JWT_ACCESS_SECRET.startsWith('dev_') || env.JWT_REFRESH_SECRET.startsWith('dev_')) {
    console.error('FATAL: Production JWT secrets must not use development defaults.');
    process.exit(1);
  }

  const activeBiometricKeyVar = `BIOMETRIC_KEY_${env.BIOMETRIC_ACTIVE_KEY_VERSION.toUpperCase()}`;
  if (!process.env[activeBiometricKeyVar]) {
    console.error(`FATAL: Missing production biometric encryption key (${activeBiometricKeyVar}).`);
    process.exit(1);
  }
}

module.exports = env;
