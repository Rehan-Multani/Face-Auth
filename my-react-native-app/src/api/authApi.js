import apiClient from './client';

export const authApi = {
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

  async enrollFace({ challengeToken, faceDescriptor, samples, metadata }) {
    const response = await apiClient.post('/auth/face/enroll', {
      challengeToken,
      faceDescriptor,
      samples,
      metadata,
    });
    return response.data;
  },

  async verifyFaceLogin({ challengeToken, faceDescriptor }) {
    const response = await apiClient.post('/auth/face/verify', {
      challengeToken,
      faceDescriptor,
    });
    return response.data;
  },

  async disableFaceAuth() {
    const response = await apiClient.post('/auth/face/disable');
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
