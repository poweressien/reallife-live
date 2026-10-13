import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { fetchNotifications, markAllRead, notificationText } from '@/features/notifications/api';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => fetchNotifications() });
  const read = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const hasUnread = q.data?.some((n) => !n.read_at);

  return (
    <Screen padded={false}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: spacing.lg,
        }}
      >
        <Text variant="title">Activity</Text>
        {hasUnread ? (
          <Button
            title="Mark all read"
            variant="ghost"
            onPress={() => read.mutate()}
            loading={read.isPending}
          />
        ) : null}
      </View>
      {q.isPending ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={56} />
          <Skeleton height={56} />
        </View>
      ) : q.isError ? (
        <ErrorState message="Couldn't load notifications." onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="Nothing yet"
              message="New followers and invitations will show up here."
            />
          }
          renderItem={({ item }) => {
            const name = item.actor?.display_name ?? 'Someone';
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: item.read_at ? colors.background : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Avatar uri={item.actor?.avatar_url} name={name} size={40} />
                <Text style={{ flex: 1 }}>{notificationText(item.type, name)}</Text>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
