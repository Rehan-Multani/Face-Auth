import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { Input } from '../../src/components/common/Input';
import { Button } from '../../src/components/common/Button';
import { ErrorBanner } from '../../src/components/common/ErrorBanner';
import { Colors } from '../../src/constants/Colors';

export default function LoginScreen() {
  const router = useRouter();
  const { login, authError, clearError } = useAuth();
  const { isConnected } = useNetworkStatus();
  const scheme = useColorScheme() ?? 'dark';
  const theme = Colors[scheme];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const errors = {};
    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.email = 'Enter a valid email address';
    }

    if (!password) {
      errors.password = 'Password is required';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async () => {
    clearError();
    if (!validate()) return;

    setIsSubmitting(true);
    const result = await login({ email: email.trim(), password });
    setIsSubmitting(false);

    if (result.success) {
      router.replace('/(app)');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header Branding */}
        <View style={styles.header}>
          <View
            style={[
              styles.logoCircle,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.primaryGlow },
            ]}
          >
            <Ionicons name="shield-checkmark" size={36} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>Welcome Back</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Secure Face & Password Authentication
          </Text>

          {/* Update Verification Badge */}
          <View style={[styles.versionBadge, { backgroundColor: theme.primaryGlow, borderColor: theme.primary }]}>
            <Ionicons name="flash" size={14} color={theme.primary} />
            <Text style={[styles.versionBadgeText, { color: theme.primaryLight }]}>
              v2.0 Ultra-Fast 1-Tap AI Biometrics
            </Text>
          </View>
        </View>


        {/* Offline Alert */}
        {!isConnected && (
          <ErrorBanner
            type="offline"
            message="No internet connection. Please check your network."
          />
        )}

        {/* Auth Error Banner */}
        {authError && (
          <ErrorBanner
            type="error"
            message={authError}
            onDismiss={clearError}
            onRetry={handleLogin}
          />
        )}

        {/* Instant Face Login (Primary Zero-Credential Action) */}
        <View style={styles.form}>
          <Button
            title="Instant Face Login (No Password)"
            variant="primary"
            icon={<Ionicons name="scan" size={22} color="#FFFFFF" />}
            onPress={() => router.push('/(auth)/face-login')}
            disabled={!isConnected}
            style={{ marginBottom: 6 }}
          />
          <Text style={[styles.faceLoginHint, { color: theme.textSecondary }]}>
            Direct 1:N biometric login • No email or password required
          </Text>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>OR USE PASSWORD</Text>
            <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />
          </View>

          <Input
            label="Email Address"
            placeholder="you@domain.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: null }));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            error={fieldErrors.email}
            leftIcon={<Ionicons name="mail-outline" size={18} color={theme.textMuted} />}
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: null }));
            }}
            secureTextEntry
            error={fieldErrors.password}
            leftIcon={<Ionicons name="lock-closed-outline" size={18} color={theme.textMuted} />}
          />

          <Button
            title="Sign In with Password"
            variant="secondary"
            onPress={handleLogin}
            loading={isSubmitting}
            disabled={isSubmitting || !isConnected}
            style={{ marginTop: 12 }}
          />
        </View>


        {/* Footer Link */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Don&apos;t have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.7}>
            <Text style={[styles.footerLink, { color: theme.primaryLight }]}>Register</Text>
          </TouchableOpacity>
        </View>

        {/* Build Verification Tag */}
        <View style={styles.buildTagContainer}>
          <Text style={[styles.buildTagText, { color: theme.textMuted }]}>
            FaceAuth AI • v2.0-Production (Instant 1-Tap)
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  versionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 6,
  },
  versionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  form: {
    width: '100%',
  },
  faceLoginHint: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  buildTagContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  buildTagText: {
    fontSize: 11,
    fontWeight: '500',
  },
});

