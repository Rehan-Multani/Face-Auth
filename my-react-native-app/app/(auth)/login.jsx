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

        {/* Form Fields */}
        <View style={styles.form}>
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
            title="Sign In"
            onPress={handleLogin}
            loading={isSubmitting}
            disabled={isSubmitting || !isConnected}
            style={{ marginTop: 12 }}
          />

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />
            <Text style={[styles.dividerText, { color: theme.textMuted }]}>OR</Text>
            <View style={[styles.divider, { backgroundColor: theme.surfaceBorder }]} />
          </View>

          {/* Biometric Face Login CTA */}
          <Button
            title="Sign In with Face Biometrics"
            variant="secondary"
            icon={<Ionicons name="scan-outline" size={20} color={theme.secondary} />}
            onPress={() => router.push('/(auth)/face-login')}
            disabled={!isConnected}
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
    marginBottom: 32,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  form: {
    width: '100%',
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
    marginTop: 36,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
