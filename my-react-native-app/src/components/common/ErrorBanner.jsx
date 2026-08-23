import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

export const ErrorBanner = ({
  message,
  onRetry = null,
  onDismiss = null,
  type = 'error', // 'error' | 'warning' | 'offline'
  style,
}) => {
  const scheme = useColorScheme() ?? 'dark';
  const theme = Colors[scheme];

  if (!message) return null;

  const isOffline = type === 'offline';
  const isWarning = type === 'warning';

  const bgColor = isOffline
    ? theme.warningSurface
    : isWarning
    ? theme.warningSurface
    : theme.errorSurface;

  const borderColor = isOffline
    ? theme.warning
    : isWarning
    ? theme.warning
    : theme.errorBorder;

  const iconName = isOffline
    ? 'cloud-offline-outline'
    : isWarning
    ? 'warning-outline'
    : 'alert-circle-outline';

  const iconColor = isOffline || isWarning ? theme.warning : theme.error;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          borderColor: borderColor,
        },
        style,
      ]}
    >
      <Ionicons name={iconName} size={20} color={iconColor} style={styles.icon} />
      <Text style={[styles.text, { color: theme.text }]} numberOfLines={3}>
        {message}
      </Text>

      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={[styles.actionBtn, { backgroundColor: theme.surfaceElevated }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionText, { color: theme.primaryLight }]}>Retry</Text>
        </TouchableOpacity>
      )}

      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={18} color={theme.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginVertical: 8,
    width: '100%',
  },
  icon: {
    marginRight: 10,
  },
  text: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  dismissBtn: {
    padding: 4,
    marginLeft: 6,
  },
});
