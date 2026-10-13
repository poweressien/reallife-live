import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { Text } from './Text';

export function LiveBadge() {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.live }]} accessibilityLabel="Live now">
      <View style={styles.dot} />
      <Text variant="caption" color="#FFFFFF" style={styles.label}>
        LIVE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  label: { fontWeight: '800', letterSpacing: 0.5 },
});
