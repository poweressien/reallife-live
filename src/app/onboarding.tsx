import React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { signOut } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { ProfileForm } from '@/features/profile/ProfileForm';
import { spacing } from '@/theme/tokens';

export default function OnboardingScreen() {
  const { userId, refreshProfile } = useAuth();
  if (!userId) return null;
  return (
    <Screen scroll contentStyle={{ gap: spacing.xl, paddingVertical: spacing.xl }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="display">Set up your profile</Text>
        <Text muted>Pick a username people can find you by. You can change everything later.</Text>
      </View>
      <ProfileForm userId={userId} mode="create" submitLabel="Continue" onSaved={refreshProfile} />
      <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
