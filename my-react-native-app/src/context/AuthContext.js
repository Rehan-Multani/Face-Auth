import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/authApi';
import { SecureStorage } from '../services/secureStorage';

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Restore stored session on cold start
  const bootstrapAsync = useCallback(async () => {
    try {
      setIsLoading(true);
      const { accessToken, user: storedUser } = await SecureStorage.getSession();

      if (accessToken) {
        if (storedUser) {
          setUser(storedUser);
          setIsAuthenticated(true);
        }

        // Verify with backend silently
        try {
          const profile = await authApi.getMe();
          if (profile?.user) {
            setUser(profile.user);
            setIsAuthenticated(true);
            await SecureStorage.setItem('auth_user_data_sec', JSON.stringify(profile.user));
          }
        } catch {
          // Token might have expired or network offline, kept local session if possible
        }
      }
    } catch (err) {
      console.warn('[AuthContext] Session restore error:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrapAsync();
  }, [bootstrapAsync]);

  const login = async ({ email, password }) => {
    setAuthError(null);
    try {
      const data = await authApi.login({ email, password });
      await SecureStorage.saveSession(data.accessToken, data.refreshToken, data.user);
      setUser(data.user);
      setIsAuthenticated(true);
      return { success: true, user: data.user };
    } catch (err) {
      const message = err.message || 'Login failed. Please check your credentials.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  const register = async ({ name, email, password }) => {
    setAuthError(null);
    try {
      const data = await authApi.register({ name, email, password });
      await SecureStorage.saveSession(data.accessToken, data.refreshToken, data.user);
      setUser(data.user);
      setIsAuthenticated(true);
      return { success: true, user: data.user };
    } catch (err) {
      const message = err.message || 'Registration failed. Please try again.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  const faceLogin = async ({ challengeToken, faceDescriptor }) => {
    setAuthError(null);
    try {
      const data = await authApi.verifyFaceLogin({ challengeToken, faceDescriptor });
      await SecureStorage.saveSession(data.accessToken, data.refreshToken, data.user);
      setUser(data.user);
      setIsAuthenticated(true);
      return { success: true, user: data.user, matchConfidence: data.matchConfidence };
    } catch (err) {
      const message = err.message || 'Face authentication failed.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  const enrollFace = async ({ challengeToken, faceDescriptor, samples, metadata }) => {
    setAuthError(null);
    try {
      const data = await authApi.enrollFace({ challengeToken, faceDescriptor, samples, metadata });
      const updatedUser = { ...user, isFaceRegistered: true };
      setUser(updatedUser);
      await SecureStorage.setItem('auth_user_data_sec', JSON.stringify(updatedUser));
      return { success: true, message: data.message };
    } catch (err) {
      const message = err.message || 'Failed to enroll face biometric.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  const disableFaceAuth = async () => {
    setAuthError(null);
    try {
      const data = await authApi.disableFaceAuth();
      const updatedUser = { ...user, isFaceRegistered: false };
      setUser(updatedUser);
      await SecureStorage.setItem('auth_user_data_sec', JSON.stringify(updatedUser));
      return { success: true, message: data.message };
    } catch (err) {
      const message = err.message || 'Failed to disable face biometric.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  const logout = async () => {
    try {
      const { refreshToken } = await SecureStorage.getSession();
      if (refreshToken) {
        await authApi.logout(refreshToken);
      }
    } catch {
      // Ignore network errors on logout
    } finally {
      await SecureStorage.clearSession();
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(null);
    }
  };

  const clearError = () => setAuthError(null);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    authError,
    login,
    register,
    faceLogin,
    enrollFace,
    disableFaceAuth,
    logout,
    clearError,
    refreshProfile: bootstrapAsync,
  };


  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
