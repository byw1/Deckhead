import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { standings } from '@/game/scoring';
import { isJustPlay } from '@/game/teams';
import type { Session } from '@/game/types';
import { useDatabase } from '@/hooks/useDatabase';
import { useNewGameStore } from '@/hooks/useNewGameStore';
import { useSessionStore } from '@/hooks/useSessionStore';
import { getDeck } from '@/storage/deckRepo';
import { getResumableSession } from '@/storage/sessionRepo';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const database = useDatabase();

  const resumeSession = useSessionStore((s) => s.resumeSession);
  const resetDraft = useNewGameStore((s) => s.reset);

  const [saved, setSaved] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);

  // Checked on focus rather than once, so finishing a game clears the resume
  // card without needing a restart.
  useFocusEffect(
    useCallback(() => {
      if (database.status !== 'ready') return;

      let cancelled = false;
      const { db } = database;

      void (async () => {
        const session = await getResumableSession(db);
        if (!cancelled) setSaved(session);
      })();

      return () => {
        cancelled = true;
      };
    }, [database]),
  );

  const resume = async () => {
    if (!saved || database.status !== 'ready' || busy) return;
    setBusy(true);

    try {
      const loaded = await Promise.all(saved.deckIds.map((id) => getDeck(database.db, id)));
      const decks = loaded.flatMap((deck) =>
        deck ? [{ id: deck.id, name: deck.name, accentColor: deck.accentColor, cards: deck.cards }] : [],
      );

      // A deck deleted since the game started would leave nothing to draw.
      if (decks.length === 0) {
        setSaved(null);
        return;
      }

      resumeSession(saved, decks, Date.now() >>> 0);
      router.push('/round/standings');
    } finally {
      setBusy(false);
    }
  };

  const newGame = () => {
    resetDraft();
    router.push('/new/decks');
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.masthead}>
        <Text card variant="display" style={styles.wordmark}>
          DECKHEAD
        </Text>
        <Text variant="body" tone="muted">
          Phone on your forehead. Everyone else shouts clues.
        </Text>
      </View>

      <View style={styles.actions}>
        {saved ? <ResumeCard session={saved} onPress={() => void resume()} disabled={busy} /> : null}
        <Button
          label={saved ? 'New game' : 'Start a game'}
          variant={saved ? 'secondary' : 'primary'}
          onPress={newGame}
        />
        <Button label="Decks" onPress={() => router.push('/decks')} />
        <Button label="Settings" onPress={() => router.push('/settings')} />
      </View>
    </Screen>
  );
}

function ResumeCard({
  session,
  onPress,
  disabled,
}: {
  session: Session;
  onPress: () => void;
  disabled: boolean;
}) {
  const played = session.rounds.filter((r) => r.endedAt !== null).length;
  const table = standings(session);
  const solo = isJustPlay(session.teams);

  const summary = solo
    ? `${played} ${played === 1 ? 'round' : 'rounds'} in`
    : table
        .slice(0, 2)
        .map((s) => `${s.teamName} ${s.score}`)
        .join(' · ');

  return (
    <View style={styles.resume}>
      <Text variant="caption" tone="faint" style={styles.resumeLabel}>
        GAME IN PROGRESS
      </Text>
      <Text variant="body" tone="muted" style={styles.resumeSummary}>
        {played === 0 ? 'Not started yet' : summary}
      </Text>
      <Button label="Carry on" variant="primary" onPress={onPress} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.xl,
  },
  masthead: { gap: space.sm, paddingTop: space.xl },
  wordmark: { fontSize: 56, lineHeight: 60, color: color.brand },
  actions: { gap: space.sm },
  resume: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    marginBottom: space.sm,
  },
  resumeLabel: { letterSpacing: 1.2 },
  resumeSummary: { paddingBottom: space.xs },
});
