import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { countOutcomes } from '@/game/scoring';
import type { Outcome } from '@/game/types';
import { useRoundScreenMode } from '@/hooks/useRoundScreenMode';
import { useHaptics } from '@/hooks/useHaptics';
import { findPoolCard, useRoundStore } from '@/hooks/useRoundStore';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

/**
 * Every card from the round, with the result, tappable to override.
 *
 * Overrides matter because the holder is guessing blind and the group is
 * shouting: a mis-tap is normal, and arguing about it is worse than fixing it.
 * Score is derived from these results, so flipping one here is the whole edit.
 */
export default function RoundRecapScreen() {
  const router = useRouter();
  const haptics = useHaptics();

  const results = useRoundStore((s) => s.state.results);
  const reshuffled = useRoundStore((s) => s.state.reshuffled);
  const pool = useRoundStore((s) => s.pool);
  const overrideResult = useRoundStore((s) => s.overrideResult);
  const reset = useRoundStore((s) => s.reset);

  // Stays landscape: the phone is still sideways from the round.
  useRoundScreenMode({ landscape: true });

  const { correct, passed } = useMemo(() => countOutcomes(results), [results]);

  const finish = () => {
    reset();
    router.dismissAll();
    router.replace('/');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text card variant="display">
          {correct}
        </Text>
        <Text variant="body" tone="muted">
          {correct === 1 ? '1 card' : `${correct} cards`} got, {passed}{' '}
          {passed === 1 ? 'pass' : 'passes'}
        </Text>
        {reshuffled ? (
          <Text variant="caption" tone="faint">
            The decks ran out and were reshuffled.
          </Text>
        ) : null}
      </View>

      <FlatList
        data={results}
        keyExtractor={(result) => result.cardId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No cards this round"
            body="The timer ran out before anything was answered. Have another go."
          />
        }
        renderItem={({ item }) => {
          const card = findPoolCard(pool, item.cardId);
          const next: Outcome = item.outcome === 'correct' ? 'pass' : 'correct';

          return (
            <Pressable
              onPress={() => {
                haptics.select();
                overrideResult(item.cardId, next);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${card?.text ?? 'Card'}, ${
                item.outcome === 'correct' ? 'got it' : 'passed'
              }. Tap to change to ${next === 'correct' ? 'got it' : 'passed'}.`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View
                style={[
                  styles.marker,
                  { backgroundColor: item.outcome === 'correct' ? color.correct : color.pass },
                ]}
              />
              <View style={styles.rowBody}>
                <Text variant="body" numberOfLines={1}>
                  {card?.text ?? 'Card'}
                </Text>
                {/* The clue-giver hint. Shown here, never on the card. */}
                {card?.note ? (
                  <Text variant="caption" tone="faint" numberOfLines={1}>
                    {card.note}
                  </Text>
                ) : null}
              </View>
              <Text variant="label" tone="muted">
                {item.outcome === 'correct' ? 'Got it' : 'Pass'}
              </Text>
            </Pressable>
          );
        }}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={finish}
          accessibilityRole="button"
          style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
        >
          <Text variant="heading">Done</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.xs,
  },
  list: {
    paddingVertical: space.sm,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
  },
  rowPressed: {
    backgroundColor: color.surface,
  },
  marker: {
    width: 6,
    height: 36,
    borderRadius: radius.sm,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  footer: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  done: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  donePressed: {
    backgroundColor: color.surfaceRaised,
  },
});
