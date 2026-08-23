import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { Config } from '../constants/Config';

// In-memory fallback for web/unsupported environments to prevent crashes
const memoryStorage = new Map();

export const SecureStorage = {
  async setItem(key, value) {
    try {
      if (Platform.OS === 'web') {
        memoryStorage.set(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });
    } catch (error) {
      console.warn(`[SecureStore] Error writing key "${key}":`, error.message);
      memoryStorage.set(key, value);
    }
  },

  async getItem(key) {
    try {
      if (Platform.OS === 'web') {
        return memoryStorage.get(key) || null;
      }
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.warn(`[SecureStore] Error reading key "${key}":`, error.message);
      return memoryStorage.get(key) || null;
    }
  },

  async deleteItem(key) {
    try {
      if (Platform.OS === 'web') {
        memoryStorage.delete(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn(`[SecureStore] Error deleting key "${key}":`, error.message);
      memoryStorage.delete(key);
    }
  },

  async saveSession(accessToken, refreshToken, user) {
    if (accessToken) await this.setItem(Config.TOKEN_KEYS.ACCESS_TOKEN, accessToken);
    if (refreshToken) await this.setItem(Config.TOKEN_KEYS.REFRESH_TOKEN, refreshToken);
    if (user) await this.setItem(Config.TOKEN_KEYS.USER_DATA, JSON.stringify(user));
  },

  async getSession() {
    const accessToken = await this.getItem(Config.TOKEN_KEYS.ACCESS_TOKEN);
    const refreshToken = await this.getItem(Config.TOKEN_KEYS.REFRESH_TOKEN);
    const rawUser = await this.getItem(Config.TOKEN_KEYS.USER_DATA);

    let user = null;
    if (rawUser) {
      try {
        user = JSON.parse(rawUser);
      } catch {
        user = null;
      }
    }

    return { accessToken, refreshToken, user };
  },

  async clearSession() {
    await this.deleteItem(Config.TOKEN_KEYS.ACCESS_TOKEN);
    await this.deleteItem(Config.TOKEN_KEYS.REFRESH_TOKEN);
    await this.deleteItem(Config.TOKEN_KEYS.USER_DATA);
  },
};
