import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
  accessibilityHint,
}: Props) {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const palette = {
    primary: {
      bg: colors.primary,
      pressed: colors.primaryPressed,
      fg: colors.onPrimary,
      border: 'transparent',
    },
    secondary: {
      bg: colors.surfaceAlt,
      pressed: colors.border,
      fg: colors.text,
      border: colors.border,
    },
    ghost: { bg: 'transparent', pressed: colors.surface, fg: colors.text, border: 'transparent' },
    danger: { bg: colors.danger, pressed: colors.danger, fg: '#FFFFFF', border: 'transparent' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.55 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text variant="label" color={palette.fg}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH + 4,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
