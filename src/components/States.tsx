import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type DimensionValue } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { Button } from './Button';
import { Text } from './Text';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="summary">
      <Ionicons name={icon} size={48} color={colors.textMuted} />
      <Text variant="title" style={styles.centerText}>
        {title}
      </Text>
      <Text muted style={styles.centerText}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={48} color={colors.danger} />
      <Text variant="title" style={styles.centerText}>
        Something went wrong
      </Text>
      <Text muted style={styles.centerText}>
        {message}
      </Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

/** Lightweight pulsing placeholder (single native-driven opacity animation; cheap on low-end phones). */
export function Skeleton({
  width = '100%',
  height = 16,
  round,
}: {
  width?: DimensionValue;
  height?: number;
  round?: boolean;
}) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        opacity,
        backgroundColor: colors.surfaceAlt,
        borderRadius: round ? radius.pill : radius.sm,
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  centerText: { textAlign: 'center' },
});
