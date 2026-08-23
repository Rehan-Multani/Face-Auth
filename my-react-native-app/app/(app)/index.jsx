import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/hooks/useAuth';
import { useNetworkStatus } from '../../src/hooks/useNetworkStatus';
import { Button } from '../../src/components/common/Button';
import { Skeleton } from '../../src/components/common/Skeleton';
import { ErrorBanner } from '../../src/components/common/ErrorBanner';
import { Colors } from '../../src/constants/Colors';

export default function DashboardScreen() {
  const router = useRouter();
  const { user, logout, refreshProfile } = useAuth();
  const { isConnected } = useNetworkStatus();
  const scheme = useColorScheme() ?? 'dark';
  const theme = Colors[scheme];

  const [refreshing, setRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  }, [refreshProfile]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
    setIsLoggingOut(false);
    router.replace('/(auth)/login');
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No data';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'No data';
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Top App Bar */}
      <View style={[styles.appBar, { borderBottomColor: theme.surfaceBorder }]}>
        <View style={styles.brandRow}>
          <Ionicons name="shield-checkmark" size={24} color={theme.primary} />
          <Text style={[styles.brandTitle, { color: theme.text }]}>SecureAuth</Text>
        </View>
        <TouchableOpacity
          onPress={onRefresh}
          style={[styles.iconButton, { backgroundColor: theme.surfaceElevated }]}
          activeOpacity={0.7}
        >
          <Ionicons name="sync-outline" size={18} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        {/* Offline Alert */}
        {!isConnected && (
          <ErrorBanner
            type="offline"
            message="Offline mode. Cached session data displayed."
          />
        )}

        {/* User Profile Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.surfaceBorder,
            },
          ]}
        >
          <View style={styles.avatarRow}>
            <View
              style={[
                styles.avatarCircle,
                { backgroundColor: theme.primaryGlow, borderColor: theme.primary },
              ]}
            >
              <Text style={[styles.avatarInitial, { color: theme.primaryLight }]}>
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>

            <View style={styles.userInfo}>
              {user ? (
                <>
                  <Text style={[styles.userName, { color: theme.text }]}>{user.name}</Text>
                  <Text style={[styles.userEmail, { color: theme.textSecondary }]}>
                    {user.email}
                  </Text>
                </>
              ) : (
                <>
                  <Skeleton width={140} height={20} />
                  <Skeleton width={200} height={14} style={{ marginTop: 6 }} />
                </>
              )}
            </View>
          </View>

          {/* Biometric Status Row */}
          <View
            style={[
              styles.statusBadgeRow,
              {
                backgroundColor: user?.isFaceRegistered
                  ? theme.successSurface
                  : theme.warningSurface,
                borderColor: user?.isFaceRegistered
                  ? theme.successBorder
                  : theme.warning,
              },
            ]}
          >
            <Ionicons
              name={user?.isFaceRegistered ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={user?.isFaceRegistered ? theme.success : theme.warning}
            />
            <Text
              style={[
                styles.statusBadgeText,
                { color: user?.isFaceRegistered ? theme.success : theme.warning },
              ]}
            >
              {user?.isFaceRegistered
                ? 'Face Biometric Enrolled & Active'
                : 'Face Biometric Not Set Up'}
            </Text>
          </View>
        </View>

        {/* Face Authentication Action Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.surfaceBorder,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <View
              style={[
                styles.cardIconBox,
                { backgroundColor: theme.primaryGlow },
              ]}
            >
              <Ionicons name="scan-outline" size={22} color={theme.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Face Biometric Security
              </Text>
              <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
                {user?.isFaceRegistered
                  ? 'Your biometric template is stored securely in encrypted form.'
                  : 'Enable 1-second passwordless sign in by scanning your face.'}
              </Text>
            </View>
          </View>

          <Button
            title={user?.isFaceRegistered ? 'Update / Re-enroll Face' : 'Set Up Face Login'}
            variant={user?.isFaceRegistered ? 'secondary' : 'primary'}
            icon={<Ionicons name="camera-outline" size={18} color={user?.isFaceRegistered ? theme.text : '#FFFFFF'} />}
            onPress={() => router.push('/(auth)/face-enroll')}
            disabled={!isConnected}
            style={{ marginTop: 14 }}
          />
        </View>

        {/* Security & Activity Details Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.surfaceBorder,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Security Details</Text>

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
              Account Status
            </Text>
            <Text style={[styles.detailValue, { color: theme.success }]}>
              {user?.status ? user.status.toUpperCase() : 'ACTIVE'}
            </Text>
          </View>

          <View style={[styles.detailDivider, { backgroundColor: theme.surfaceBorder }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
              Face Enrolled Date
            </Text>
            <Text style={[styles.detailValue, { color: theme.text }]}>
              {user?.faceRegisteredAt ? formatDate(user.faceRegisteredAt) : 'No data'}
            </Text>
          </View>

          <View style={[styles.detailDivider, { backgroundColor: theme.surfaceBorder }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
              Last Login Time
            </Text>
            <Text style={[styles.detailValue, { color: theme.text }]}>
              {user?.lastLoginAt ? formatDate(user.lastLoginAt) : 'No data'}
            </Text>
          </View>

          <View style={[styles.detailDivider, { backgroundColor: theme.surfaceBorder }]} />

          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>
              Token Storage
            </Text>
            <Text style={[styles.detailValue, { color: theme.secondary }]}>
              Hardware Keystore / Keychain
            </Text>
          </View>
        </View>

        {/* Sign Out Button */}
        <Button
          title="Sign Out"
          variant="danger"
          icon={<Ionicons name="log-out-outline" size={18} color="#FFFFFF" />}
          onPress={handleLogout}
          loading={isLoggingOut}
          disabled={isLoggingOut}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  appBar: {
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 12,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  detailLabel: {
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailDivider: {
    height: 1,
  },
});
