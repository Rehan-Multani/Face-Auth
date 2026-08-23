import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/context/AuthContext';
import { useAuth } from '../src/hooks/useAuth';
import { Colors } from '../src/constants/Colors';



function RootNavigation() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const scheme = useColorScheme() ?? 'dark';
  const theme = Colors[scheme];

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isEnrollingFace = segments[1] === 'face-enroll';

    if (!isAuthenticated) {
      // If not authenticated and attempting to view protected screens or face-enroll
      if (!inAuthGroup || isEnrollingFace) {
        router.replace('/(auth)/login');
      }
    } else {
      // If authenticated and on login / register / face-login public screens
      if (inAuthGroup && !isEnrollingFace) {
        router.replace('/(app)');
      }
    }
  }, [isAuthenticated, isLoading, segments, router]);


  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Slot />
    </View>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme() ?? 'dark';

  return (
    <AuthProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <RootNavigation />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
