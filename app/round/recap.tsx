import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { countOutcomes, scoreRound } from '@/game/scoring';
import { whoseTurn } from '@/game/session';
import type { Outcome } from '@/game/types';
import { useDatabase } from '@/hooks/useDatabase';
import { useHaptics } from '@/hooks/useHaptics';
import { useRoundScreenMode } from '@/hooks/useRoundScreenMode';
import { findPoolCard, useSessionStore } from '@/hooks/useSessionStore';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

/**
 * Every card from the round, with the result, tappable to override.
 *
 * Overrides matter because the holder is guessing blind and the group is
 * shouting: a mis-tap is normal, and arguing about it is worse than fixing it.
 * Score is derived from these results, so flipping one here is the whole edit —
 * and nothing is written until Done, so the edits land in one go.
 */
export default function RoundRecapScreen() {
  const router = useRouter();
  const database = useDatabase();
  const haptics = useHaptics();

  const session = useSessionStore((s) => s.session);
  const results = useSessionStore((s) => s.roundState.results);
  const reshuffled = useSessionStore((s) => s.roundState.reshuffled);
  const pool = useSessionStore((s) => s.pool);
  const overrideResult = useSessionStore((s) => s.overrideResult);
  const commitRound = useSessionStore((s) => s.commitRound);

  const [saving, setSaving] = useState(false);

  // Stays landscape: the phone is still sideways from the round.
  useRoundScreenMode({ landscape: true });

  const { correct, passed } = useMemo(() => countOutcomes(results), [results]);
  const penalty = session?.settings.passPenalty ?? 0;
  const score = useMemo(() => scoreRound(results, penalty), [results, penalty]);

  // The round is still open, so whoseTurn points at whoever just played.
  const turn = session ? whoseTurn(session) : null;
  const showTeam = (session?.teams.length ?? 0) > 1;

  const done = async () => {
    if (database.status !== 'ready' || saving) return;
    setSaving(true);

    try {
      await commitRound(database.db, new Date().toISOString());
      router.replace('/round/standings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        {showTeam && turn ? (
          <Text variant="caption" tone="faint" style={{ color: turn.team.color }}>
            {turn.team.name.toUpperCase()}
          </Text>
        ) : null}
        <Text card variant="display">
          {score}
        </Text>
        <Text variant="body" tone="muted">
          {correct} got, {passed} {passed === 1 ? 'pass' : 'passes'}
          {penalty > 0 && passed > 0 ? ` · passes cost ${passed}` : ''}
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
            body="The timer ran out before anything was answered."
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
        <Button
          label={saving ? 'Saving' : 'Done'}
          variant="primary"
          disabled={saving}
          onPress={() => void done()}
        />
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
  list: { paddingVertical: space.sm, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
  },
  rowPressed: { backgroundColor: color.surface },
  marker: { width: 6, height: 36, borderRadius: radius.sm },
  rowBody: { flex: 1, gap: 2 },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
