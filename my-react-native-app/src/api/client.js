import axios, { create } from 'axios';
import { Config } from '../constants/Config';
import { SecureStorage } from '../services/secureStorage';

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

const apiClient = create({
  baseURL: Config.API_BASE_URL,
  timeout: Config.REQUEST_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request Interceptor: Attach Access Token
apiClient.interceptors.request.use(
  async (config) => {
    const accessToken = await SecureStorage.getItem(Config.TOKEN_KEYS.ACCESS_TOKEN);
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Auto Token Refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle Network / Connection Errors
    if (!error.response) {
      return Promise.reject({
        code: 'NETWORK_ERROR',
        message: 'Unable to connect to server. Please check your internet connection.',
      });
    }

    const { status, data } = error.response;

    // Check if error is 401 with TOKEN_EXPIRED and we haven't already retried
    if (status === 401 && data?.code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStorage.getItem(Config.TOKEN_KEYS.REFRESH_TOKEN);
        if (!refreshToken) {
          throw new Error('NO_REFRESH_TOKEN');
        }

        // Direct call to refresh endpoint without using interceptor instance
        const response = await axios.post(`${Config.API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data;

        await SecureStorage.setItem(Config.TOKEN_KEYS.ACCESS_TOKEN, newAccessToken);
        if (newRefreshToken) {
          await SecureStorage.setItem(Config.TOKEN_KEYS.REFRESH_TOKEN, newRefreshToken);
        }

        apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        processQueue(null, newAccessToken);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        await SecureStorage.clearSession();
        return Promise.reject({
          code: 'SESSION_EXPIRED',
          message: 'Your session has expired. Please log in again.',
        });
      } finally {
        isRefreshing = false;
      }
    }

    // Normalized error structure
    const normalizedError = {
      status: status || 500,
      code: data?.code || 'REQUEST_FAILED',
      message: data?.message || 'Something went wrong. Please try again.',
      errors: data?.errors || null,
    };

    return Promise.reject(normalizedError);
  }
);

export default apiClient;
