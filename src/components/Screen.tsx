import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  /** Skip the top inset (e.g. when a native header is shown). */
  noTopInset?: boolean;
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/** Safe-area + keyboard-aware screen container used by every non-fullscreen route. */
export function Screen({ children, scroll, noTopInset, padded = true, contentStyle }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inner: ViewStyle = {
    paddingTop: noTopInset ? 0 : insets.top,
    paddingBottom: insets.bottom,
    paddingHorizontal: padded ? spacing.lg : 0,
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[inner, styles.grow, contentStyle]}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, inner, contentStyle]}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, grow: { flexGrow: 1 } });
