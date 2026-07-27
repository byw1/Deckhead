import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { duplicateDeck } from '@/decks/edit';
import { isPlayable, MIN_PLAYABLE_CARDS, type StoredDeck } from '@/decks/types';
import { useDatabase } from '@/hooks/useDatabase';
import { useHaptics } from '@/hooks/useHaptics';
import { deleteDeck, getDeck, upsertDeck } from '@/storage/deckRepo';
import { Button } from '@/ui/Button';
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
  const haptics = useHaptics();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  // Reloads on focus so returning from the editor shows the saved deck.
  useFocusEffect(
    useCallback(() => {
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
    }, [database, id]),
  );

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
  const bundled = deck.source === 'bundled';

  /**
   * Duplicating mints fresh card ids, which is what lets a bundled deck be
   * customised without the copy and the original marking each other's cards as
   * seen in a session holding both.
   */
  const duplicate = async () => {
    if (database.status !== 'ready' || busy) return;
    setBusy(true);

    try {
      const copy = duplicateDeck(deck, new Date().toISOString());
      await upsertDeck(database.db, copy, 'custom');
      haptics.select();
      router.replace(`/decks/${copy.id}`);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      `Delete ${deck.name}?`,
      `${deck.cards.length} ${deck.cards.length === 1 ? 'card' : 'cards'} will go with it. This cannot be undone.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (database.status !== 'ready') return;
            void (async () => {
              await deleteDeck(database.db, deck.id);
              router.replace('/decks');
            })();
          },
        },
      ],
    );
  };

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
        ListFooterComponent={
          <View style={styles.actions}>
            {/* Bundled decks are read-only. Duplicating gives you an editable
                copy, which is better than letting an app update overwrite the
                changes you made to one. */}
            {bundled ? (
              <>
                <Button label="Share" onPress={() => router.push(`/decks/share/${deck.id}`)} />
                <Button
                  label={busy ? 'Copying' : 'Duplicate to edit'}
                  disabled={busy}
                  onPress={() => void duplicate()}
                  accessibilityHint="Makes an editable copy of this deck"
                />
                <Text variant="caption" tone="faint" style={styles.actionNote}>
                  Decks that come with Deckhead cannot be changed, so updates never overwrite your
                  work.
                </Text>
              </>
            ) : (
              <>
                <Button
                  label="Share"
                  variant="primary"
                  onPress={() => router.push(`/decks/share/${deck.id}`)}
                />
                <Button label="Edit" onPress={() => router.push(`/decks/edit/${deck.id}`)} />
                <Button
                  label={busy ? 'Copying' : 'Duplicate'}
                  disabled={busy}
                  onPress={() => void duplicate()}
                />
                <Button label="Delete" onPress={confirmDelete} />
              </>
            )}
          </View>
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
  actions: {
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  actionNote: {
    paddingTop: space.xs,
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
