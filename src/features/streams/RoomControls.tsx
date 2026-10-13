import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH } from '@/theme/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function RoundButton({
  icon,
  label,
  onPress,
  active = true,
  danger,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.btn,
        {
          backgroundColor: danger
            ? '#FF2D55'
            : active
              ? 'rgba(0,0,0,0.55)'
              : 'rgba(255,255,255,0.9)',
        },
      ]}
    >
      <Ionicons name={icon} size={24} color={danger || active ? '#FFFFFF' : '#12121A'} />
    </Pressable>
  );
}

export const ControlsRow = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.row}>{children}</View>
);

const styles = StyleSheet.create({
  btn: {
    width: MIN_TOUCH + 8,
    height: MIN_TOUCH + 8,
    borderRadius: (MIN_TOUCH + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'center' },
});
