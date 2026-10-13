import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Text } from './Text';

type Props = { uri?: string | null; name: string; size?: number };

export function Avatar({ uri, name, size = 44 }: Props) {
  const { colors } = useTheme();
  const initials = name.trim().slice(0, 2).toUpperCase() || '?';
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[box, { backgroundColor: colors.surfaceAlt }]}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
        accessibilityLabel={`${name} avatar`}
      />
    );
  }
  return (
    <View
      style={[styles.fallback, box, { backgroundColor: colors.accent }]}
      accessibilityLabel={`${name} avatar`}
    >
      <Text variant="label" color="#FFFFFF" style={{ fontSize: size * 0.36 }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ fallback: { alignItems: 'center', justifyContent: 'center' } });
