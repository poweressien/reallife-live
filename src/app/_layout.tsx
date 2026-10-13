import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConfigErrorScreen } from '@/components/ConfigErrorScreen';
import { ErrorState } from '@/components/States';
import { envResult } from '@/config/env';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { colors, isDark } = useTheme();
  const auth = useAuth();
  const signedIn = !!auth.session;
  const hasProfile = !!auth.profile;
  const booting = auth.status === 'loading' || (signedIn && auth.profileLoading);

  useEffect(() => {
    if (!booting) SplashScreen.hideAsync().catch(() => undefined);
  }, [booting]);

  if (booting) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Signed in but the profile request failed (e.g. offline): retry instead of showing onboarding.
  if (signedIn && auth.profileError && !hasProfile) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ErrorState
          message="We couldn't load your profile. Check your connection and try again."
          onRetry={auth.retryProfile}
        />
      </View>
    );
  }

  const recovering = auth.recoveryPending;
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen name="auth-callback" />
        <Stack.Protected guard={recovering}>
          <Stack.Screen name="reset-password" />
        </Stack.Protected>
        <Stack.Protected guard={!recovering && !signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!recovering && signedIn && !hasProfile}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!recovering && signedIn && hasProfile}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" />
          <Stack.Screen
            name="broadcast/[id]"
            options={{ gestureEnabled: false, animation: 'fade' }}
          />
          <Stack.Screen name="watch/[id]" options={{ animation: 'fade' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 2, staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          {envResult.ok ? (
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <RootNavigator />
              </AuthProvider>
            </QueryClientProvider>
          ) : (
            <ConfigErrorScreen issues={envResult.issues} />
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
