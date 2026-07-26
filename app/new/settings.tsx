import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { makeSessionId } from '@/game/ids';
import { ROUND_SECONDS_PRESETS, type WinCondition } from '@/game/types';
import { useDatabase } from '@/hooks/useDatabase';
import { useHaptics } from '@/hooks/useHaptics';
import { useNewGameStore } from '@/hooks/useNewGameStore';
import { useSessionStore } from '@/hooks/useSessionStore';
import { getDeck } from '@/storage/deckRepo';
import { discardOtherUnfinishedSessions, saveSession } from '@/storage/sessionRepo';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Screen } from '@/ui/Screen';
import { StepHeader } from '@/ui/StepHeader';
import { Text } from '@/ui/Text';
import { space } from '@/ui/tokens';

const WIN_CONDITIONS: { label: string; value: WinCondition; help: string }[] = [
  { label: 'Rounds', value: { kind: 'rounds', count: 4 }, help: 'Everyone gets the same number of turns.' },
  { label: 'Score', value: { kind: 'score', target: 20 }, help: 'First past the target, once the round is even.' },
  { label: 'Deck out', value: { kind: 'deckExhausted' }, help: 'Play until the cards run out.' },
];

const ROUND_COUNTS = [2, 3, 4, 6, 8];
const SCORE_TARGETS = [10, 15, 20, 30];

/** Step three of three: how the game is played and how it ends. */
export default function NewGameSettingsScreen() {
  const router = useRouter();
  const database = useDatabase();
  const haptics = useHaptics();

  const deckIds = useNewGameStore((s) => s.deckIds);
  const settings = useNewGameStore((s) => s.settings);
  const setRoundSeconds = useNewGameStore((s) => s.setRoundSeconds);
  const setPassPenalty = useNewGameStore((s) => s.setPassPenalty);
  const setWinCondition = useNewGameStore((s) => s.setWinCondition);
  const resolvedTeams = useNewGameStore((s) => s.resolvedTeams);
  const resetDraft = useNewGameStore((s) => s.reset);

  const startSession = useSessionStore((s) => s.startSession);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    if (database.status !== 'ready' || starting) return;
    setStarting(true);

    try {
      const loaded = await Promise.all(deckIds.map((id) => getDeck(database.db, id)));
      const decks = loaded.flatMap((deck) =>
        deck ? [{ id: deck.id, name: deck.name, accentColor: deck.accentColor, cards: deck.cards }] : [],
      );

      const session = startSession({
        id: makeSessionId(),
        decks,
        teams: resolvedTeams(),
        settings,
        now: new Date().toISOString(),
        seed: Date.now() >>> 0,
      });

      // Written before the first round so a crash during play still leaves
      // something to resume, and any earlier half-played game is abandoned now
      // rather than lingering to be offered later.
      await saveSession(database.db, session);
      await discardOtherUnfinishedSessions(database.db, session.id);

      resetDraft();
      router.dismissAll();
      router.replace('/round/intro');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen>
      <StepHeader step={3} of={3} title="Settings" subtitle="How the game runs" />

      <ScrollView contentContainerStyle={styles.body}>
        <Section label="ROUND LENGTH">
          <View style={styles.row}>
            {ROUND_SECONDS_PRESETS.map((preset) => (
              <Chip
                key={preset}
                label={`${preset}s`}
                selected={settings.roundSeconds === preset}
                onPress={() => {
                  haptics.select();
                  setRoundSeconds(preset);
                }}
                accessibilityLabel={`${preset} second rounds`}
              />
            ))}
          </View>
        </Section>

        <Section label="GAME ENDS ON">
          <View style={styles.row}>
            {WIN_CONDITIONS.map((option) => (
              <Chip
                key={option.label}
                label={option.label}
                selected={settings.winCondition.kind === option.value.kind}
                onPress={() => {
                  haptics.select();
                  setWinCondition(option.value);
                }}
              />
            ))}
          </View>
          <Text variant="caption" tone="muted" style={styles.help}>
            {WIN_CONDITIONS.find((o) => o.value.kind === settings.winCondition.kind)?.help}
          </Text>

          {settings.winCondition.kind === 'rounds' ? (
            <View style={styles.row}>
              {ROUND_COUNTS.map((count) => (
                <Chip
                  key={count}
                  label={String(count)}
                  selected={
                    settings.winCondition.kind === 'rounds' && settings.winCondition.count === count
                  }
                  onPress={() => {
                    haptics.select();
                    setWinCondition({ kind: 'rounds', count });
                  }}
                  accessibilityLabel={`${count} rounds each`}
                />
              ))}
            </View>
          ) : null}

          {settings.winCondition.kind === 'score' ? (
            <View style={styles.row}>
              {SCORE_TARGETS.map((target) => (
                <Chip
                  key={target}
                  label={String(target)}
                  selected={
                    settings.winCondition.kind === 'score' && settings.winCondition.target === target
                  }
                  onPress={() => {
                    haptics.select();
                    setWinCondition({ kind: 'score', target });
                  }}
                  accessibilityLabel={`First to ${target} points`}
                />
              ))}
            </View>
          ) : null}
        </Section>

        <Section label="PASSES">
          <View style={styles.row}>
            <Chip
              label="Free"
              selected={settings.passPenalty === 0}
              onPress={() => {
                haptics.select();
                setPassPenalty(0);
              }}
              accessibilityLabel="Passes cost nothing"
            />
            <Chip
              label="Cost a point"
              selected={settings.passPenalty === 1}
              onPress={() => {
                haptics.select();
                setPassPenalty(1);
              }}
            />
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={starting ? 'Starting' : 'Start'}
          variant="primary"
          disabled={starting || database.status !== 'ready'}
          onPress={() => void start()}
        />
      </View>
    </Screen>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" tone="faint" style={styles.label}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: space.xl, gap: space.lg },
  section: { gap: space.sm },
  label: { paddingHorizontal: space.lg, letterSpacing: 1.2 },
  row: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, flexWrap: 'wrap' },
  help: { paddingHorizontal: space.lg },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
