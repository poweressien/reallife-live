import React, { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { Text } from './Text';

type Props = TextInputProps & { label: string; error?: string | undefined; hint?: string };

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, style, ...rest },
  ref,
) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text variant="label" muted>
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        {...rest}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
          },
          style,
        ]}
      />
      {error ? (
        <Text variant="caption" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  input: {
    minHeight: MIN_TOUCH + 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
});
