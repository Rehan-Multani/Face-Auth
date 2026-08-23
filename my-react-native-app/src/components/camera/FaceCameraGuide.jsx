import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

const { width } = Dimensions.get('window');
const OVAL_WIDTH = width * 0.72;
const OVAL_HEIGHT = OVAL_WIDTH * 1.3;

export const FaceCameraGuide = ({
  stepText = 'Center your face within the frame',
  isScanning = false,
  status = 'ready', // 'ready' | 'scanning' | 'success' | 'failed'
  onFlipCamera = null,
  onCancel = null,
}) => {
  const scheme = useColorScheme() ?? 'dark';
  const theme = Colors[scheme];

  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isScanning || status === 'scanning') {
      const scan = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: OVAL_HEIGHT - 10,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1600,
            useNativeDriver: true,
          }),
        ])
      );
      scan.start();
      return () => scan.stop();
    } else {
      scanLineAnim.setValue(0);
    }
  }, [isScanning, status, scanLineAnim]);

  const getBorderColor = () => {
    if (status === 'success') return theme.scannerSuccessRing;
    if (status === 'failed') return theme.error;
    return theme.scannerRing;
  };

  return (
    <View style={styles.container}>
      {/* Top Header Overlay */}
      <View style={styles.topBar}>
        {onCancel && (
          <TouchableOpacity onPress={onCancel} style={styles.circleBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        {onFlipCamera && (
          <TouchableOpacity onPress={onFlipCamera} style={styles.circleBtn} activeOpacity={0.7}>
            <Ionicons name="camera-reverse-outline" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Center Reticle */}
      <View style={styles.centerContainer}>
        <View
          style={[
            styles.ovalCutout,
            {
              borderColor: getBorderColor(),
              shadowColor: getBorderColor(),
            },
          ]}
        >
          {/* Animated Laser Scanning Line */}
          {(isScanning || status === 'scanning') && (
            <Animated.View
              style={[
                styles.laserLine,
                {
                  backgroundColor: getBorderColor(),
                  transform: [{ translateY: scanLineAnim }],
                },
              ]}
            />
          )}

          {/* Corner brackets */}
          <View style={[styles.corner, styles.cornerTL, { borderColor: getBorderColor() }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: getBorderColor() }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: getBorderColor() }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: getBorderColor() }]} />
        </View>

        {/* Dynamic Status / Instruction Badge */}
        <View style={[styles.badge, { backgroundColor: 'rgba(15, 23, 42, 0.85)' }]}>
          {status === 'success' ? (
            <Ionicons name="checkmark-circle" size={20} color={theme.success} />
          ) : status === 'failed' ? (
            <Ionicons name="close-circle" size={20} color={theme.error} />
          ) : (
            <Ionicons name="scan-outline" size={20} color={theme.scannerRing} />
          )}
          <Text style={styles.badgeText}>{stepText}</Text>
        </View>
      </View>

      {/* Bottom Spacer */}
      <View style={styles.bottomBar} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovalCutout: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH / 2,
    borderWidth: 2.5,
    overflow: 'hidden',
    position: 'relative',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
  },
  laserLine: {
    width: '100%',
    height: 3,
    position: 'absolute',
    top: 0,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
  },
  cornerTL: {
    top: 16,
    left: 16,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top: 16,
    right: 16,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom: 16,
    left: 16,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  cornerBR: {
    bottom: 16,
    right: 16,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomBar: {
    height: 90,
  },
});
