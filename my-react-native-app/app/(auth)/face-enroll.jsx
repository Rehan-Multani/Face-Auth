import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
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

export default function FaceEnrollScreen() {
  const router = useRouter();
  const { enrollFace } = useAuth();
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
        setErrorMessage(err.message || 'Failed to initialize face security challenge.');
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

  const handleCaptureAndEnroll = async () => {
    if (!challengeToken) {
      fetchChallenge();
      return;
    }

    setScanStatus('scanning');
    setErrorMessage(null);

    try {
      let photo = null;
      if (cameraRef.current) {
        photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.15,
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

      const result = await enrollFace({
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
        setErrorMessage(result.message || 'Face enrollment failed.');
        fetchChallenge();
      }
    } catch (err) {
      setScanStatus('failed');
      setErrorMessage(err.message || 'An error occurred during face enrollment.');
      fetchChallenge();
    }
  };


  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

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
          Please allow camera access to register your face biometric for secure sign-in.
        </Text>
        <Button title="Grant Camera Permission" onPress={requestPermission} style={{ width: '100%', marginTop: 24 }} />
        <Button
          title="Cancel"
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
            ? LIVENESS_STEPS[currentStepIndex]?.title || 'Registering facial landmarks...'
            : scanStatus === 'success'
            ? 'Face Registered Successfully!'
            : scanStatus === 'failed'
            ? 'Enrollment Failed'
            : 'Align your face in the oval to enroll'
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
          <Button
            title={isChallengeLoading ? 'Securing Session...' : 'Capture & Register Face'}
            onPress={handleCaptureAndEnroll}
            loading={isChallengeLoading}
            disabled={isChallengeLoading}
            icon={<Ionicons name="finger-print" size={20} color="#FFFFFF" />}
            style={{ width: '100%' }}
          />
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
});
