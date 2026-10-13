import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export function ConfigErrorScreen({ issues }: { issues: { key: string; message: string }[] }) {
  const { colors } = useTheme();
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return (
    <Screen scroll contentStyle={{ justifyContent: 'center', gap: spacing.lg }}>
      <Text variant="display">Setup needed</Text>
      <Text muted>
        This build is missing configuration. Copy .env.example to .env, fill in your Supabase and
        LiveKit values, then restart with `npx expo start -c`.
      </Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          padding: spacing.lg,
          gap: spacing.sm,
        }}
      >
        {issues.map((i) => (
          <Text key={i.key} variant="caption">
            {i.key}: {i.message}
          </Text>
        ))}
      </View>
    </Screen>
  );
}
