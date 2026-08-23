import { Platform } from 'react-native';

// In development, Android emulator uses 10.0.2.2 to access host machine localhost
const getDevApiUrl = () => {
  // If EXPO_PUBLIC_API_URL is specified in .env, use it
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  // Default to live Vercel backend
  return 'https://face-auth-beta.vercel.app/api';
};

export const Config = {
  API_BASE_URL: getDevApiUrl(),

  REQUEST_TIMEOUT_MS: 12000,
  TOKEN_KEYS: {
    ACCESS_TOKEN: 'auth_access_token_sec',
    REFRESH_TOKEN: 'auth_refresh_token_sec',
    USER_DATA: 'auth_user_data_sec',
  },
  FACE_RECOGNITION: {
    DESCRIPTOR_LENGTH: 128,
    CHALLENGE_TIMEOUT_MS: 120000,
  },
};
