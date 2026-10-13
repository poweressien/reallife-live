import { useQuery } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { Screen } from '@/components/Screen';
import { EmptyState, ErrorState } from '@/components/States';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { sanitizeSearch, searchProfiles } from '@/features/social/api';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

export default function DiscoverScreen() {
  const { colors } = useTheme();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(sanitizeSearch(text)), 350);
    return () => clearTimeout(t);
  }, [text]);

  const q = useQuery({
    queryKey: ['search-profiles', term],
    queryFn: () => searchProfiles(term),
    enabled: term.length >= 2,
  });

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Text variant="title">Discover</Text>
        <TextField
          label="Search creators"
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Username or name"
        />
      </View>
      {term.length < 2 ? (
        <EmptyState
          icon="search-outline"
          title="Find creators"
          message="Search by username or display name. Category and map discovery arrive in later milestones."
        />
      ) : q.isError ? (
        <ErrorState message="Search failed." onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, flexGrow: 1 }}
          ListEmptyComponent={
            q.isPending ? null : (
              <EmptyState
                icon="people-outline"
                title="No matches"
                message="Try a different spelling."
              />
            )
          }
          renderItem={({ item }) => (
            <View
              style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Avatar uri={item.avatar_url} name={item.display_name} />
              <View>
                <Text variant="label">{item.display_name}</Text>
                <Text variant="caption" muted>
                  @{item.username}
                </Text>
              </View>
            </View>
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
