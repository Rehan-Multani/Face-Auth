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
import { extractFaceDescriptorFromImage, LIVENESS_STEPS } from '../../src/services/faceDetection';
import { FaceCameraGuide } from '../../src/components/camera/FaceCameraGuide';
import { Button } from '../../src/components/common/Button';
import { ErrorBanner } from '../../src/components/common/ErrorBanner';
import { Colors } from '../../src/constants/Colors';

export default function FaceLoginScreen() {
  const router = useRouter();
  const { faceLogin } = useAuth();
  const scheme = useColorScheme() ?? 'dark';
  const theme = Colors[scheme];

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState('front');
  const [challengeToken, setChallengeToken] = useState(null);
  const [isChallengeLoading, setIsChallengeLoading] = useState(true);
  const [scanStatus, setScanStatus] = useState('ready'); // 'ready' | 'scanning' | 'success' | 'failed'
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);

  const cameraRef = useRef(null);
  const isMounted = useRef(true);

  // Fetch anti-replay challenge on mount
  const fetchChallenge = async () => {
    try {
      setIsChallengeLoading(true);
      setErrorMessage(null);
      const data = await authApi.getFaceChallenge();
      if (isMounted.current && data?.challengeToken) {
        setChallengeToken(data.challengeToken);
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

    // Liveness progression simulation
    setTimeout(() => {
      if (isMounted.current) setCurrentStepIndex(1);
    }, 700);

    setTimeout(() => {
      if (isMounted.current) setCurrentStepIndex(2);
    }, 1400);

    setTimeout(async () => {
      if (!isMounted.current) return;

      try {
        let photo = null;
        if (cameraRef.current) {
          photo = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.35,
          });
        }

        if (!photo?.base64) {
          setScanStatus('failed');
          setErrorMessage('Could not capture frame from camera. Please hold steady.');
          fetchChallenge();
          return;
        }

        const featureResult = extractFaceDescriptorFromImage(photo.base64);
        if (!featureResult.success) {
          setScanStatus('failed');
          setErrorMessage(featureResult.message);
          fetchChallenge();
          return;
        }

        const result = await faceLogin({
          challengeToken,
          faceDescriptor: featureResult.descriptor,
        });

        if (result.success) {
          setScanStatus('success');
          setTimeout(() => {
            router.replace('/(app)');
          }, 600);
        } else {
          setScanStatus('failed');
          setErrorMessage(result.message || 'Face not recognized. Only registered face can login.');
          fetchChallenge(); // Refresh challenge token for next attempt
        }
      } catch (err) {
        setScanStatus('failed');
        setErrorMessage(err.message || 'An error occurred during face scan.');
        fetchChallenge();
      }
    }, 2000);
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

  return (
    <View style={styles.container}>
      {/* Live Camera View (No nested children) */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing} />

      {/* Scanner Oval Overlay */}
      <FaceCameraGuide
        stepText={
          scanStatus === 'scanning'
            ? LIVENESS_STEPS[currentStepIndex]?.title || 'Verifying face...'
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
