import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ROUND_SECONDS_PRESETS } from '@/game/types';
import { useDatabase } from '@/hooks/useDatabase';
import { useHaptics } from '@/hooks/useHaptics';
import { useRoundStore } from '@/hooks/useRoundStore';
import { getDeck, listDeckSummaries } from '@/storage/deckRepo';
import type { DeckSummary } from '@/decks/types';
import { MIN_PLAYABLE_CARDS, summaryIsPlayable } from '@/decks/types';
import { readableTextOn } from '@/ui/contrast';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, minTapTarget, radius, space } from '@/ui/tokens';

/**
 * Pick decks and a round length, then go.
 *
 * M2 is a single round with no session around it, so there are no teams here
 * yet. Teams, win conditions and the multi-round loop arrive in M3 and this
 * screen grows the two extra steps then.
 */
export default function PlaySetupScreen() {
  const router = useRouter();
  const database = useDatabase();
  const prepare = useRoundStore((s) => s.prepare);

  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [seconds, setSeconds] = useState<number>(60);
  const [starting, setStarting] = useState(false);

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

  const haptics = useHaptics();

  const toggle = (deckId: string) => {
    haptics.select();
    setSelected((current) =>
      current.includes(deckId) ? current.filter((id) => id !== deckId) : [...current, deckId],
    );
  };

  const totalCards = (decks ?? [])
    .filter((d) => selected.includes(d.id))
    .reduce((sum, d) => sum + d.cardCount, 0);

  const enoughCards = totalCards >= MIN_PLAYABLE_CARDS;
  const canStart = selected.length > 0 && enoughCards && !starting;

  const start = async () => {
    if (database.status !== 'ready' || !canStart) return;
    setStarting(true);

    const loaded = await Promise.all(selected.map((id) => getDeck(database.db, id)));
    const playable = loaded.flatMap((deck) =>
      deck ? [{ id: deck.id, name: deck.name, accentColor: deck.accentColor, cards: deck.cards }] : [],
    );

    prepare(playable, {
      roundSeconds: seconds,
      // A fresh order every round, so playing the same decks twice does not
      // deal the same sequence.
      seed: Date.now() >>> 0,
      shuffleAcrossDecks: true,
    });

    router.push('/round/intro');
    setStarting(false);
  };

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
      <View style={styles.header}>
        <Text card variant="title">
          NEW ROUND
        </Text>
        <Text variant="caption" tone="muted">
          Pick your decks
        </Text>
      </View>

      <FlatList
        data={decks}
        keyExtractor={(deck) => deck.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const isSelected = selected.includes(item.id);
          const playable = summaryIsPlayable(item);

          return (
            <Pressable
              onPress={() => toggle(item.id)}
              disabled={!playable}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isSelected, disabled: !playable }}
              accessibilityLabel={`${item.name}, ${item.cardCount} cards`}
              style={({ pressed }) => [
                styles.deckRow,
                pressed && styles.deckRowPressed,
                !playable && styles.deckRowDisabled,
              ]}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: item.accentColor, opacity: isSelected ? 1 : 0.35 },
                ]}
              >
                {isSelected ? (
                  <Text
                    variant="label"
                    style={[styles.tick, { color: readableTextOn(item.accentColor) }]}
                  >
                    ✓
                  </Text>
                ) : null}
              </View>

              <View style={styles.deckBody}>
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
        ListHeaderComponent={
          <View style={styles.lengths}>
            <Text variant="caption" tone="faint" style={styles.sectionLabel}>
              ROUND LENGTH
            </Text>
            <View style={styles.lengthRow}>
              {ROUND_SECONDS_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  onPress={() => {
                    haptics.select();
                    setSeconds(preset);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: seconds === preset }}
                  accessibilityLabel={`${preset} seconds`}
                  style={[styles.length, seconds === preset && styles.lengthSelected]}
                >
                  <Text variant="label" tone={seconds === preset ? 'default' : 'muted'}>
                    {preset}s
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text variant="caption" tone="faint" style={styles.sectionLabel}>
              DECKS
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title="No decks" body="Something went wrong opening the bundled decks." />
        }
      />

      <View style={styles.footer}>
        <Pressable
          onPress={() => void start()}
          disabled={!canStart}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canStart }}
          style={({ pressed }) => [
            styles.start,
            canStart ? styles.startEnabled : styles.startDisabled,
            pressed && canStart && styles.startPressed,
          ]}
        >
          <Text variant="heading" tone={canStart ? 'default' : 'faint'}>
            {selected.length === 0
              ? 'Pick a deck'
              : !enoughCards
                ? `${MIN_PLAYABLE_CARDS} cards needed`
                : `Start · ${totalCards} cards`}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: 2,
  },
  list: {
    paddingBottom: space.md,
    flexGrow: 1,
  },
  lengths: {
    paddingTop: space.sm,
  },
  sectionLabel: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
    letterSpacing: 1.2,
  },
  lengthRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  length: {
    minHeight: minTapTarget,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  lengthSelected: {
    backgroundColor: color.surfaceRaised,
    borderWidth: 2,
    borderColor: color.brand,
  },
  deckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  deckRowPressed: {
    backgroundColor: color.surface,
  },
  deckRowDisabled: {
    opacity: 0.4,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    fontSize: 20,
    lineHeight: 24,
  },
  deckBody: {
    flex: 1,
    gap: 2,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  start: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  startEnabled: {
    backgroundColor: color.brand,
  },
  startDisabled: {
    backgroundColor: color.surface,
  },
  startPressed: {
    opacity: 0.85,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
