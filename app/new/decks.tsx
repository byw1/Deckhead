import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { MIN_PLAYABLE_CARDS, summaryIsPlayable, type DeckSummary } from '@/decks/types';
import { useDatabase } from '@/hooks/useDatabase';
import { useHaptics } from '@/hooks/useHaptics';
import { useNewGameStore } from '@/hooks/useNewGameStore';
import { listDeckSummaries } from '@/storage/deckRepo';
import { Button } from '@/ui/Button';
import { readableTextOn } from '@/ui/contrast';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { StepHeader } from '@/ui/StepHeader';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

/** Step one of three: which decks are in play. */
export default function NewGameDecksScreen() {
  const router = useRouter();
  const database = useDatabase();
  const haptics = useHaptics();

  const deckIds = useNewGameStore((s) => s.deckIds);
  const toggleDeck = useNewGameStore((s) => s.toggleDeck);

  const [decks, setDecks] = useState<DeckSummary[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (database.status !== 'ready') return;

      let cancelled = false;
      const { db } = database;

      void (async () => {
        const all = await listDeckSummaries(db);
        if (!cancelled) setDecks(all);
      })();

      return () => {
        cancelled = true;
      };
    }, [database]),
  );

  const totalCards = (decks ?? [])
    .filter((d) => deckIds.includes(d.id))
    .reduce((sum, d) => sum + d.cardCount, 0);

  const enough = totalCards >= MIN_PLAYABLE_CARDS;

  if (database.status === 'error') {
    return (
      <Screen>
        <EmptyState title="Deckhead could not open your decks" body={database.message} />
      </Screen>
    );
  }

  if (!decks) {
    return (
      <Screen>
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <StepHeader step={1} of={3} title="Decks" subtitle="Pick what you are playing with" />

      <FlatList
        data={decks}
        keyExtractor={(deck) => deck.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = deckIds.includes(item.id);
          const playable = summaryIsPlayable(item);

          return (
            <Pressable
              onPress={() => {
                haptics.select();
                toggleDeck(item.id);
              }}
              disabled={!playable}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: !playable }}
              accessibilityLabel={`${item.name}, ${item.cardCount} cards`}
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
                !playable && styles.rowDisabled,
              ]}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: item.accentColor, opacity: selected ? 1 : 0.3 },
                ]}
              >
                {selected ? (
                  <Text variant="heading" style={{ color: readableTextOn(item.accentColor) }}>
                    ✓
                  </Text>
                ) : null}
              </View>

              <View style={styles.body}>
                <Text variant="body" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text variant="caption" tone="faint">
                  {item.cardCount} cards{playable ? '' : ' · too few to play'}
                </Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState title="No decks" body="Something went wrong opening the bundled decks." />
        }
      />

      <View style={styles.footer}>
        <Button
          label={
            deckIds.length === 0
              ? 'Pick a deck'
              : !enough
                ? `${MIN_PLAYABLE_CARDS} cards needed`
                : `Next · ${totalCards} cards`
          }
          variant="primary"
          disabled={!enough}
          onPress={() => router.push('/new/teams')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.sm, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  rowPressed: { backgroundColor: color.surface },
  rowDisabled: { opacity: 0.4 },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
