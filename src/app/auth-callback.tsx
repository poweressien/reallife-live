import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Landing route for email-confirmation / password-reset deep links. The link itself is processed
 * by AuthProvider; this screen just waits briefly and then lets the navigation guards pick the
 * right destination (tabs, onboarding, reset-password, or sign-in with an error).
 */
export default function AuthCallbackScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { status, session, linkError, recoveryPending } = useAuth();

  useEffect(() => {
    if (status !== 'ready') return;
    if (session || linkError || recoveryPending) {
      router.replace('/');
      return;
    }
    const t = setTimeout(() => router.replace('/'), 2500); // nothing arrived: fall back to sign-in
    return () => clearTimeout(t);
  }, [status, session, linkError, recoveryPending, router]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
