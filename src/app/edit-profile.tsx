import { router } from 'expo-router';
import React from 'react';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { ProfileForm } from '@/features/profile/ProfileForm';
import { spacing } from '@/theme/tokens';

export default function EditProfileScreen() {
  const { userId, profile, refreshProfile } = useAuth();
  if (!userId || !profile) return null;
  return (
    <Screen scroll contentStyle={{ gap: spacing.xl, paddingVertical: spacing.xl }}>
      <Text variant="title">Edit profile</Text>
      <ProfileForm
        userId={userId}
        mode="update"
        initial={profile}
        submitLabel="Save"
        onSaved={async () => {
          await refreshProfile();
          router.back();
        }}
      />
    </Screen>
  );
}
