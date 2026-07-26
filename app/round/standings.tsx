import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { makeSessionId } from '@/game/ids';
import { playerStandings, standings } from '@/game/scoring';
import { rematch, sessionWinState, whoseTurn } from '@/game/session';
import { isJustPlay } from '@/game/teams';
import { useDatabase } from '@/hooks/useDatabase';
import { useRoundScreenMode } from '@/hooks/useRoundScreenMode';
import { useSessionStore } from '@/hooks/useSessionStore';
import { getDeck } from '@/storage/deckRepo';
import { saveSession } from '@/storage/sessionRepo';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

/**
 * Where the game stands, between rounds and at the end.
 *
 * One screen rather than two. The difference between "standings" and "final
 * standings" is what the game is asking you to do next, not what it is showing
 * you, so the table stays put and only the footer changes.
 *
 * Portrait: the phone comes off the forehead here and gets passed round.
 */
export default function StandingsScreen() {
  const router = useRouter();
  const database = useDatabase();

  const session = useSessionStore((s) => s.session);
  const poolExhausted = useSessionStore((s) => s.poolExhausted);
  const completeSessionInStore = useSessionStore((s) => s.completeSession);
  const startSession = useSessionStore((s) => s.startSession);
  const reset = useSessionStore((s) => s.reset);

  const [busy, setBusy] = useState(false);

  // Back to portrait: the round flow is over for now.
  useRoundScreenMode({ landscape: false });

  const winState = useMemo(
    () => (session ? sessionWinState(session, poolExhausted) : { over: false as const }),
    [session, poolExhausted],
  );

  const table = useMemo(() => (session ? standings(session) : []), [session]);
  const players = useMemo(() => (session ? playerStandings(session) : []), [session]);
  const solo = session ? isJustPlay(session.teams) : false;

  // Stamp the session complete as soon as it is over, so quitting from here
  // does not leave a finished game offering to resume.
  useEffect(() => {
    if (!winState.over || !session || session.completedAt || database.status !== 'ready') return;
    void completeSessionInStore(database.db, new Date().toISOString());
  }, [winState.over, session, database, completeSessionInStore]);

  if (!session) {
    return (
      <Screen>
        <EmptyState title="No game in progress" body="Start a new game from the home screen." />
        <View style={styles.footer}>
          <Button label="Home" variant="primary" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  const turn = whoseTurn(session);

  const playAgain = async () => {
    if (database.status !== 'ready' || busy) return;
    setBusy(true);

    try {
      const next = rematch(session, makeSessionId(), new Date().toISOString());

      const loaded = await Promise.all(next.deckIds.map((id) => getDeck(database.db, id)));
      const decks = loaded.flatMap((deck) =>
        deck ? [{ id: deck.id, name: deck.name, accentColor: deck.accentColor, cards: deck.cards }] : [],
      );

      const created = startSession({
        id: next.id,
        decks,
        teams: next.teams,
        settings: next.settings,
        now: next.createdAt,
        seed: Date.now() >>> 0,
      });

      await saveSession(database.db, created);
      router.replace('/round/intro');
    } finally {
      setBusy(false);
    }
  };

  const goHome = () => {
    reset();
    router.dismissAll();
    router.replace('/');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text card variant="title">
          {winState.over ? 'FINAL' : 'STANDINGS'}
        </Text>
        {winState.over ? (
          <Text variant="body" tone="muted">
            {winState.winners.length === 1
              ? `${winState.winners[0]!.teamName} wins`
              : `${winState.winners.map((w) => w.teamName).join(' and ')} tie`}
          </Text>
        ) : (
          <Text variant="body" tone="muted">
            {session.rounds.filter((r) => r.endedAt !== null).length} rounds played
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* With one team the team row is just the total, so the per-player
            table is the interesting one and goes first. */}
        {solo ? null : (
          <View style={styles.section}>
            {table.map((standing, index) => {
              const winner = winState.over && winState.winners.some((w) => w.teamId === standing.teamId);

              return (
                <View key={standing.teamId} style={[styles.row, winner && styles.winnerRow]}>
                  <Text variant="label" tone="faint" style={styles.position}>
                    {index + 1}
                  </Text>
                  <View style={[styles.dot, { backgroundColor: standing.teamColor }]} />
                  <View style={styles.rowBody}>
                    <Text variant="body">{standing.teamName}</Text>
                    <Text variant="caption" tone="faint">
                      {standing.correct} got · {standing.passed}{' '}
                      {standing.passed === 1 ? 'pass' : 'passes'} · {standing.roundsPlayed}{' '}
                      {standing.roundsPlayed === 1 ? 'round' : 'rounds'}
                    </Text>
                  </View>
                  <Text card variant="title">
                    {standing.score}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {players.length > 0 ? (
          <View style={styles.section}>
            <Text variant="caption" tone="faint" style={styles.sectionLabel}>
              {solo ? 'SCORES' : 'BY PLAYER'}
            </Text>
            {players.map((player, index) => (
              <View key={`${player.teamId}/${player.playerName}`} style={styles.row}>
                <Text variant="label" tone="faint" style={styles.position}>
                  {index + 1}
                </Text>
                <View style={styles.rowBody}>
                  <Text variant="body">{player.playerName}</Text>
                  <Text variant="caption" tone="faint">
                    {player.correct} got · {player.roundsPlayed}{' '}
                    {player.roundsPlayed === 1 ? 'round' : 'rounds'}
                  </Text>
                </View>
                <Text card variant="heading">
                  {player.score}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {poolExhausted ? (
          <Text variant="caption" tone="faint" style={styles.note}>
            The decks ran out and were reshuffled.
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {winState.over ? (
          <>
            <Button
              label={busy ? 'Starting' : 'Play again'}
              variant="primary"
              disabled={busy}
              onPress={() => void playAgain()}
            />
            <Button label="Home" onPress={goHome} />
          </>
        ) : (
          <>
            <Button
              label={turn?.playerName ? `Next · ${turn.playerName}` : 'Next round'}
              variant="primary"
              onPress={() => router.replace('/round/intro')}
            />
            <Button label="Finish later" onPress={goHome} accessibilityHint="Your game is saved" />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: 2,
  },
  body: { paddingBottom: space.lg, gap: space.lg },
  section: { gap: space.xs },
  sectionLabel: { paddingHorizontal: space.lg, paddingTop: space.sm, letterSpacing: 1.2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  winnerRow: {
    backgroundColor: color.surface,
  },
  position: { minWidth: 20 },
  dot: { width: 14, height: 14, borderRadius: radius.pill },
  rowBody: { flex: 1, gap: 2 },
  note: { paddingHorizontal: space.lg },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
});
