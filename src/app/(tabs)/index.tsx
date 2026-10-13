import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { LiveBadge } from '@/components/LiveBadge';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState, Skeleton } from '@/components/States';
import { Text } from '@/components/Text';
import { fetchLiveStreams } from '@/features/streams/api';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/** Milestone 1: real list of live public streams. The immersive vertical player arrives with LiveKit (Milestone 2). */
export default function HomeScreen() {
  const { colors } = useTheme();
  const q = useQuery({
    queryKey: ['live-streams'],
    queryFn: () => fetchLiveStreams(),
    refetchInterval: 15_000,
  });

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
        <Text variant="title">Live now</Text>
      </View>
      {q.isPending ? (
        <View style={{ padding: spacing.lg, gap: spacing.lg }}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : q.isError ? (
        <ErrorState message="Couldn't load live streams." onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={q.isRefetching}
              onRefresh={() => void q.refetch()}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="radio-outline"
              title="No one is live right now"
              message="Pull down to refresh, or be the first to go live."
            />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Watch ${item.title} by ${item.host.display_name}`}
              onPress={() => router.push({ pathname: '/watch/[id]', params: { id: item.id } })}
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Avatar uri={item.host.avatar_url} name={item.host.display_name} size={48} />
              <View style={{ flex: 1 }}>
                <Text variant="label" numberOfLines={1}>
                  {item.title}
                </Text>
                <Text variant="caption" muted numberOfLines={1}>
                  @{item.host.username}
                  {item.category ? ` · ${item.category}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <LiveBadge />
                <Text variant="caption" muted>
                  {item.viewer_count} watching
                </Text>
              </View>
            </Pressable>
          )}
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
