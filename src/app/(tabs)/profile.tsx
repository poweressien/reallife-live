import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchFollowCounts } from '@/features/profile/api';
import { spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const { profile, userId } = useAuth();
  const counts = useQuery({
    queryKey: ['follow-counts', userId],
    queryFn: () => fetchFollowCounts(userId as string),
    enabled: !!userId,
  });
  if (!profile) return null;

  const stat = (label: string, value: number | undefined) => (
    <View style={{ alignItems: 'center' }}>
      <Text variant="title">{value ?? '–'}</Text>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );

  return (
    <Screen
      scroll
      contentStyle={{ gap: spacing.xl, alignItems: 'center', paddingVertical: spacing.xl }}
    >
      <Avatar uri={profile.avatar_url} name={profile.display_name} size={104} />
      <View style={{ alignItems: 'center', gap: 2 }}>
        <Text variant="title">{profile.display_name}</Text>
        <Text muted>@{profile.username}</Text>
      </View>
      {profile.bio ? <Text style={{ textAlign: 'center' }}>{profile.bio}</Text> : null}
      <View style={{ flexDirection: 'row', gap: spacing.xxl }}>
        {stat('Followers', counts.data?.followers)}
        {stat('Following', counts.data?.following)}
      </View>
      <View style={{ alignSelf: 'stretch', gap: spacing.md }}>
        <Button title="Edit profile" onPress={() => router.push('/edit-profile')} />
        <Button title="Settings" variant="secondary" onPress={() => router.push('/settings')} />
      </View>
    </Screen>
  );
}
