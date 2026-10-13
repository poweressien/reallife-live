import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Switch, View } from 'react-native';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { signOut } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { fetchSettings, updateSetting, type SettingKey } from '@/features/settings/api';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

const TOGGLES: { key: SettingKey; label: string; hint?: string }[] = [
  { key: 'is_private_account', label: 'Private account' },
  { key: 'notify_followers', label: 'New follower notifications' },
  { key: 'notify_invites', label: 'Stream invitation notifications' },
  { key: 'notify_go_live', label: 'Followed creators go live' },
  {
    key: 'location_sharing_enabled',
    label: 'Allow location sharing',
    hint: 'Off by default. You still choose per broadcast.',
  },
  { key: 'recording_default', label: 'Record broadcasts by default' },
  { key: 'data_saver', label: 'Data saver', hint: 'Prefer lower video quality on mobile data.' },
];

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const { userId } = useAuth();
  const qc = useQueryClient();
  const key = ['settings', userId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchSettings(userId as string),
    enabled: !!userId,
  });
  const toggle = useMutation({
    mutationFn: ({ k, v }: { k: SettingKey; v: boolean }) => updateSetting(userId as string, k, v),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
    onError: () => Alert.alert('Not saved', "Couldn't update that setting. Check your connection."),
  });

  const themes: ThemePreference[] = ['system', 'light', 'dark'];

  return (
    <Screen scroll contentStyle={{ gap: spacing.xl, paddingVertical: spacing.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title">Settings</Text>
        <Button title="Done" variant="ghost" onPress={() => router.back()} />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="label" muted>
          Theme
        </Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {themes.map((t) => (
            <Button
              key={t}
              title={t[0]!.toUpperCase() + t.slice(1)}
              variant={preference === t ? 'primary' : 'secondary'}
              onPress={() => setPreference(t)}
              style={{ flex: 1, paddingHorizontal: spacing.sm }}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.md }}>
        <Text variant="label" muted>
          Privacy & notifications
        </Text>
        {q.isError ? (
          <ErrorState message="Couldn't load your settings." onRetry={() => void q.refetch()} />
        ) : (
          TOGGLES.map(({ key: k, label, hint }) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text>{label}</Text>
                {hint ? (
                  <Text variant="caption" muted>
                    {hint}
                  </Text>
                ) : null}
              </View>
              <Switch
                accessibilityLabel={label}
                disabled={!q.data || toggle.isPending}
                value={q.data?.[k] ?? false}
                onValueChange={(v) => toggle.mutate({ k, v })}
                trackColor={{ true: colors.primary }}
              />
            </View>
          ))
        )}
      </View>

      <View style={{ gap: spacing.md }}>
        <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
        <Button
          title="Delete account"
          variant="danger"
          onPress={() =>
            Alert.alert(
              'Not available yet',
              'Account deletion needs a secure server function and is added in the production-preparation milestone.',
            )
          }
        />
      </View>
    </Screen>
  );
}
