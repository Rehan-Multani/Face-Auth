import apiClient from './client';
import { SecureStorage } from '../services/secureStorage';
import { Config } from '../constants/Config';

export const authApi = {
  async getDeviceId() {
    return SecureStorage.getItem(Config.TOKEN_KEYS.DEVICE_ID);
  },

  async register({ name, email, password }) {
    const response = await apiClient.post('/auth/register', { name, email, password });
    return response.data;
  },

  async login({ email, password }) {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  },

  async getFaceChallenge() {
    const response = await apiClient.get('/auth/face/challenge');
    return response.data;
  },

  async enrollFace({ challengeToken, faceDescriptor, samples, frameSignals, metadata }) {
    const existingDeviceId = await this.getDeviceId();
    const response = await apiClient.post('/auth/face/enroll', {
      challengeToken,
      faceDescriptor,
      samples,
      frameSignals,
      deviceId: existingDeviceId || undefined,
      metadata,
    });
    if (response.data?.deviceId) {
      await SecureStorage.setItem(Config.TOKEN_KEYS.DEVICE_ID, response.data.deviceId);
    }
    return response.data;
  },

  async verifyFaceLogin({ challengeToken, faceDescriptor, frameSignals }) {
    const deviceId = await this.getDeviceId();
    const response = await apiClient.post('/auth/face/verify', {
      challengeToken,
      faceDescriptor,
      frameSignals,
      deviceId,
    });
    return response.data;
  },

  async disableFaceAuth() {
    const deviceId = await this.getDeviceId();
    const response = await apiClient.post('/auth/face/disable', { deviceId: deviceId || undefined });
    return response.data;
  },


  async logout(refreshToken) {
    try {
      const response = await apiClient.post('/auth/logout', { refreshToken });
      return response.data;
    } catch {
      // Best effort logout
      return { success: true };
    }
  },

  async getMe() {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },
};
