import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { authApi } from '../../src/api/authApi';
import { captureLivenessBurst } from '../../src/services/livenessCapture';
import { FaceCameraGuide } from '../../src/components/camera/FaceCameraGuide';
import { Button } from '../../src/components/common/Button';
import { ErrorBanner } from '../../src/components/common/ErrorBanner';
import { Colors } from '../../src/constants/Colors';
import { LIVENESS_INSTRUCTIONS } from '../../src/constants/Config';

export default function FaceLoginScreen() {
  const router = useRouter();
  const { faceLogin } = useAuth();
  const scheme = useColorScheme() ?? 'dark';
  const theme = Colors[scheme];

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('front');
  const [challengeToken, setChallengeToken] = useState(null);
  const [livenessAction, setLivenessAction] = useState(null);
  const [isChallengeLoading, setIsChallengeLoading] = useState(true);
  const [deviceNotEnrolled, setDeviceNotEnrolled] = useState(false);
  const [scanStatus, setScanStatus] = useState('ready'); // 'ready' | 'scanning' | 'success' | 'failed'
  const [errorMessage, setErrorMessage] = useState(null);

  const cameraRef = useRef(null);
  const isMounted = useRef(true);

  // Fetch anti-replay challenge (with its assigned liveness action) on mount.
  // Skipped entirely if this device was never enrolled — face login can only
  // ever succeed for the device it was set up on, so we fail fast in the UI
  // instead of making a request that will always be rejected.
  const fetchChallenge = async () => {
    try {
      setIsChallengeLoading(true);
      setErrorMessage(null);

      const deviceId = await authApi.getDeviceId();
      if (!deviceId) {
        if (isMounted.current) {
          setDeviceNotEnrolled(true);
          setIsChallengeLoading(false);
        }
        return;
      }

      const data = await authApi.getFaceChallenge();
      if (isMounted.current && data?.challengeToken) {
        setChallengeToken(data.challengeToken);
        setLivenessAction(data.livenessAction);
      }
    } catch (err) {
      if (isMounted.current) {
        setErrorMessage(err.message || 'Unable to initialize face security challenge.');
      }
    } finally {
      if (isMounted.current) {
        setIsChallengeLoading(false);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchChallenge();

    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleCaptureAndAuthenticate = async () => {
    if (!challengeToken) {
      fetchChallenge();
      return;
    }

    setScanStatus('scanning');
    setErrorMessage(null);

    try {
      const burst = await captureLivenessBurst(cameraRef);
      if (!burst.success) {
        setScanStatus('failed');
        setErrorMessage(burst.message);
        fetchChallenge();
        return;
      }

      const result = await faceLogin({
        challengeToken,
        faceDescriptor: burst.lastDescriptor,
        frameSignals: burst.frameSignals,
      });

      if (result.success) {
        setScanStatus('success');
        setTimeout(() => {
          router.replace('/(app)');
        }, 500);
      } else {
        setScanStatus('failed');
        setErrorMessage(result.message || 'Face not recognized. Only registered face can login.');
        fetchChallenge(); // Refresh challenge token (and liveness action) for next attempt
      }
    } catch (err) {
      setScanStatus('failed');
      setErrorMessage(err.message || 'An error occurred during face scan.');
      fetchChallenge();
    }
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  // Permission Check UI
  if (!permission) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background, padding: 24 }]}>
        <Ionicons name="camera-outline" size={64} color={theme.primary} style={{ marginBottom: 16 }} />
        <Text style={[styles.permTitle, { color: theme.text }]}>Camera Access Required</Text>
        <Text style={[styles.permSubtitle, { color: theme.textSecondary }]}>
          Face recognition requires camera permission to securely verify your identity.
        </Text>
        <Button title="Grant Permission" onPress={requestPermission} style={{ width: '100%', marginTop: 24 }} />
        <Button
          title="Back to Sign In"
          variant="outline"
          onPress={() => router.back()}
          style={{ width: '100%', marginTop: 8 }}
        />
      </View>
    );
  }

  // This device has never enrolled a face credential — face-login is
  // device-bound, so guide the user to password login / enrollment instead
  // of attempting a request that can never succeed on this device.
  if (!isChallengeLoading && deviceNotEnrolled) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background, padding: 24 }]}>
        <Ionicons name="finger-print-outline" size={64} color={theme.primary} style={{ marginBottom: 16 }} />
        <Text style={[styles.permTitle, { color: theme.text }]}>Face Login Not Set Up</Text>
        <Text style={[styles.permSubtitle, { color: theme.textSecondary }]}>
          This device hasn&apos;t been enrolled for face login yet. Sign in with your password first, then enable
          Face Login from your account.
        </Text>
        <Button
          title="Use Email & Password"
          onPress={() => router.replace('/(auth)/login')}
          style={{ width: '100%', marginTop: 24 }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Live Camera View (No nested children) */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing} />

      {/* Scanner Oval Overlay */}
      <FaceCameraGuide
        stepText={
          scanStatus === 'scanning'
            ? LIVENESS_INSTRUCTIONS[livenessAction] || 'Verifying face...'
            : scanStatus === 'success'
            ? 'Face Authenticated!'
            : scanStatus === 'failed'
            ? 'Face Not Recognized'
            : 'Center your face to login'
        }
        status={scanStatus}
        isScanning={scanStatus === 'scanning'}
        onFlipCamera={toggleCameraFacing}
        onCancel={() => router.back()}
      />

      {/* Bottom Control Actions */}
      <View style={styles.bottomControls}>
        {errorMessage && (
          <ErrorBanner
            type="error"
            message={errorMessage}
            onRetry={fetchChallenge}
            style={{ marginBottom: 12 }}
          />
        )}

        {scanStatus !== 'scanning' && scanStatus !== 'success' && (
          <>
            <Button
              title={isChallengeLoading ? 'Securing Session...' : 'Scan Face to Authenticate'}
              onPress={handleCaptureAndAuthenticate}
              loading={isChallengeLoading}
              disabled={isChallengeLoading}
              icon={<Ionicons name="scan" size={20} color="#FFFFFF" />}
              style={{ width: '100%' }}
            />

            <TouchableOpacity
              onPress={() => router.replace('/(auth)/login')}
              style={styles.fallbackLink}
              activeOpacity={0.7}
            >
              <Text style={styles.fallbackText}>Use Email & Password instead</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  permSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 34,
    left: 20,
    right: 20,
    zIndex: 20,
  },
  fallbackLink: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  fallbackText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
