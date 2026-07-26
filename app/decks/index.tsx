import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, StyleSheet, View } from 'react-native';
import type { DeckSummary } from '@/decks/types';
import { useDatabase } from '@/hooks/useDatabase';
import { listDeckSummaries, searchDeckSummaries } from '@/storage/deckRepo';
import { Button } from '@/ui/Button';
import { DeckCard } from '@/ui/DeckCard';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { SearchField } from '@/ui/SearchField';
import { Text } from '@/ui/Text';
import { color, space } from '@/ui/tokens';

export default function DecksScreen() {
  const router = useRouter();
  const database = useDatabase();
  const [query, setQuery] = useState('');
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);

  // Reloads on focus as well as on query change, so a deck edited or deleted
  // in M4 is current when the browser comes back rather than showing a stale
  // count until the app restarts.
  useFocusEffect(
    useCallback(() => {
      if (database.status !== 'ready') return;

      let cancelled = false;
      const { db } = database;

      void (async () => {
        const results = query.trim()
          ? await searchDeckSummaries(db, query)
          : await listDeckSummaries(db);
        if (!cancelled) setDecks(results);
      })();

      return () => {
        cancelled = true;
      };
    }, [database, query]),
  );

  const sections = useMemo(() => {
    if (!decks) return [];
    const bundled = decks.filter((d) => d.source === 'bundled');
    const custom = decks.filter((d) => d.source === 'custom');

    return [
      ...(bundled.length ? [{ title: 'Included', data: bundled }] : []),
      // Shown even when empty, so the invitation to make one has a home.
      { title: 'Yours', data: custom },
    ];
  }, [decks]);

  if (database.status === 'error') {
    return (
      <Screen>
        <Header />
        <EmptyState title="Deckhead could not open your decks" body={database.message} />
      </Screen>
    );
  }

  if (database.status === 'loading' || !decks) {
    return (
      <Screen>
        <Header />
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Header />
      <SearchField value={query} onChangeText={setQuery} />

      <SectionList
        sections={sections}
        keyExtractor={(deck) => deck.id}
        renderItem={({ item }) => (
          <DeckCard deck={item} onPress={() => router.push(`/decks/${item.id}`)} />
        )}
        renderSectionHeader={({ section }) => (
          <Text variant="caption" tone="faint" style={styles.sectionHeader}>
            {section.title.toUpperCase()}
          </Text>
        )}
        renderSectionFooter={({ section }) =>
          section.title === 'Yours' && section.data.length === 0 && !query.trim() ? (
            <Text variant="caption" tone="muted" style={styles.invitation}>
              Make a deck of inside jokes, or anything else your friends would shout at each other.
            </Text>
          ) : null
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <EmptyState
            title={query.trim() ? 'Nothing matches that' : 'No decks yet'}
            body={
              query.trim()
                ? `No deck or card mentions "${query.trim()}". Try a shorter search.`
                : 'Deckhead comes with five decks. If none are showing, something went wrong opening them.'
            }
          />
        }
      />

      <View style={styles.footer}>
        <Button
          label="New deck"
          variant="primary"
          onPress={() => router.push('/decks/edit/new')}
        />
      </View>
    </Screen>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Text card variant="title">
        DECKS
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  list: {
    paddingVertical: space.sm,
    flexGrow: 1,
  },
  invitation: {
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.md,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  sectionHeader: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
    letterSpacing: 1.2,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
