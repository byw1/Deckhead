import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { isPlayable, MIN_PLAYABLE_CARDS, type StoredDeck } from '@/decks/types';
import { useDatabase } from '@/hooks/useDatabase';
import { getDeck } from '@/storage/deckRepo';
import { readableTextOn } from '@/ui/contrast';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; deck: StoredDeck };

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const database = useDatabase();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (database.status !== 'ready' || !id) return;

    let cancelled = false;
    const { db } = database;

    void (async () => {
      const deck = await getDeck(db, id);
      if (cancelled) return;
      setState(deck ? { status: 'ready', deck } : { status: 'missing' });
    })();

    return () => {
      cancelled = true;
    };
  }, [database, id]);

  if (state.status === 'loading') {
    return (
      <Screen>
        <BackBar onPress={router.back} />
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      </Screen>
    );
  }

  if (state.status === 'missing') {
    return (
      <Screen>
        <BackBar onPress={router.back} />
        <EmptyState
          title="That deck is gone"
          body="It may have been deleted. Head back to the deck list to pick another."
        />
      </Screen>
    );
  }

  const { deck } = state;
  const accentText = readableTextOn(deck.accentColor);
  const playable = isPlayable(deck);

  return (
    <Screen edges={['top']}>
      <Stack.Screen options={{ title: deck.name }} />
      <BackBar onPress={router.back} />

      <FlatList
        data={deck.cards}
        keyExtractor={(card) => card.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={[styles.banner, { backgroundColor: deck.accentColor }]}>
              <Text card variant="display" style={[styles.bannerText, { color: accentText }]}>
                {deck.name.toUpperCase()}
              </Text>
            </View>

            {deck.description ? (
              <Text variant="body" tone="muted" style={styles.description}>
                {deck.description}
              </Text>
            ) : null}

            <View style={styles.meta}>
              <Text variant="label" tone="faint">
                {deck.cards.length} {deck.cards.length === 1 ? 'card' : 'cards'}
              </Text>
              {deck.author ? (
                <Text variant="label" tone="faint">
                  by {deck.author}
                </Text>
              ) : null}
            </View>

            {playable ? null : (
              <Text variant="caption" tone="muted" style={styles.warning}>
                A deck needs {MIN_PLAYABLE_CARDS} cards to start a round.
              </Text>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.cardRow}>
            <Text variant="caption" tone="faint" style={styles.cardIndex}>
              {index + 1}
            </Text>
            <View style={styles.cardBody}>
              <Text variant="body">{item.text}</Text>
              {/* Notes are a clue-giver hint. They belong here and in the recap,
                  never on the card itself during a round. */}
              {item.note ? (
                <Text variant="caption" tone="muted">
                  {item.note}
                </Text>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState title="This deck is empty" body="There are no cards in it yet." />
        }
      />
    </Screen>
  );
}

function BackBar({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.backBar}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Back to decks"
        hitSlop={space.md}
        style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      >
        <Text variant="label" tone="muted">
          Decks
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backBar: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  back: {
    alignSelf: 'flex-start',
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    marginLeft: -space.sm,
    borderRadius: radius.sm,
  },
  backPressed: {
    backgroundColor: color.surface,
  },
  header: {
    gap: space.sm,
    paddingBottom: space.md,
  },
  banner: {
    minHeight: 132,
    justifyContent: 'flex-end',
    padding: space.lg,
    marginHorizontal: space.lg,
    borderRadius: radius.lg,
  },
  bannerText: {
    fontSize: 34,
    lineHeight: 38,
  },
  description: {
    paddingHorizontal: space.lg,
  },
  meta: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  warning: {
    paddingHorizontal: space.lg,
  },
  list: {
    paddingBottom: space.xxl,
    flexGrow: 1,
  },
  cardRow: {
    flexDirection: 'row',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    alignItems: 'baseline',
  },
  cardIndex: {
    minWidth: 24,
    textAlign: 'right',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
