import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useDatabase } from '@/hooks/useDatabase';
import { useHaptics } from '@/hooks/useHaptics';
import { useSettingsStore } from '@/hooks/useSettings';
import { countDecks } from '@/storage/deckRepo';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const database = useDatabase();
  const haptics = useHaptics();

  const inputMode = useSettingsStore((s) => s.inputMode);
  const hapticsOn = useSettingsStore((s) => s.haptics);
  const sound = useSettingsStore((s) => s.sound);
  const boostBrightness = useSettingsStore((s) => s.boostBrightness);
  const set = useSettingsStore((s) => s.set);
  const resetAll = useSettingsStore((s) => s.resetAll);

  const [busy, setBusy] = useState(false);

  const confirmReset = () => {
    Alert.alert('Reset settings?', 'Your decks and games are not touched.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          resetAll();
          haptics.select();
        },
      },
    ]);
  };

  const confirmEraseCustomDecks = async () => {
    if (database.status !== 'ready' || busy) return;

    setBusy(true);
    const custom = await countDecks(database.db, 'custom');
    setBusy(false);

    if (custom === 0) {
      Alert.alert('Nothing to delete', 'You have not made or imported any decks yet.');
      return;
    }

    Alert.alert(
      `Delete ${custom} ${custom === 1 ? 'deck' : 'decks'}?`,
      'This removes every deck you made or imported. The decks Deckhead comes with stay. This cannot be undone.',
      [
        { text: 'Keep them', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (database.status !== 'ready') return;
            void (async () => {
              await database.db.runAsync("DELETE FROM decks WHERE source = 'custom'", []);
              router.replace('/decks');
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text card variant="title">
          SETTINGS
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Section
          label="HOW YOU ANSWER"
          help="Tap is the default because it always works. Tilt needs a deliberate movement and a return to level, so an excited jerk of the phone does not count."
        >
          <View style={styles.row}>
            <Chip
              label="Tap"
              selected={inputMode === 'tap'}
              onPress={() => {
                haptics.select();
                set('inputMode', 'tap');
              }}
              accessibilityLabel="Tap the screen to answer"
            />
            <Chip
              label="Tilt"
              selected={inputMode === 'tilt'}
              onPress={() => {
                haptics.select();
                set('inputMode', 'tilt');
              }}
              accessibilityLabel="Tilt the phone to answer"
            />
          </View>
          {inputMode === 'tilt' ? (
            <Text variant="caption" tone="faint" style={styles.pad}>
              Tilt forward for got it, back for a pass. Tapping still works.
            </Text>
          ) : null}
        </Section>

        <Toggle
          label="Haptics"
          help="The phone is against someone's forehead, so buzzes are how they know what happened."
          value={hapticsOn}
          onChange={(next) => set('haptics', next)}
        />

        <Toggle
          label="Sound"
          help="Off by default. A ding for a correct answer tells the guesser they got it before anyone speaks, and everyone else hears it too."
          value={sound}
          onChange={(next) => set('sound', next)}
        />

        <Toggle
          label="Brighten during a round"
          help="Pushes the screen to full brightness so the card reads across a dim room, then puts it back."
          value={boostBrightness}
          onChange={(next) => set('boostBrightness', next)}
        />

        <View style={styles.section}>
          <Text variant="caption" tone="faint" style={styles.label}>
            PRIVACY
          </Text>
          <Text variant="caption" tone="muted" style={styles.pad}>
            Deckhead makes no network requests. There are no accounts, no analytics and no tracking.
            Everything you make stays on this phone unless you share it yourself.
          </Text>
        </View>

        <View style={styles.section}>
          <Text variant="caption" tone="faint" style={styles.label}>
            RESET
          </Text>
          <View style={styles.actions}>
            <Button label="Reset settings" onPress={confirmReset} />
            <Button
              label="Delete my decks"
              disabled={busy}
              onPress={() => void confirmEraseCustomDecks()}
              accessibilityHint="Removes decks you made or imported. Bundled decks stay."
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Done" variant="primary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

function Section({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text variant="caption" tone="faint" style={styles.label}>
        {label}
      </Text>
      {children}
      {help ? (
        <Text variant="caption" tone="muted" style={styles.pad}>
          {help}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Every toggle carries a line saying why it exists. These are all decisions
 * with a reason behind them, and a bare switch invites people to flip it and
 * wonder what broke.
 */
function Toggle({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.toggleRow}>
        <Text variant="body" style={styles.toggleLabel}>
          {label}
        </Text>
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={label}
          accessibilityHint={help}
          trackColor={{ false: color.surfaceRaised, true: color.brand }}
          thumbColor={color.bone}
        />
      </View>
      <Text variant="caption" tone="muted" style={styles.pad}>
        {help}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  body: { paddingBottom: space.xl, gap: space.lg },
  section: { gap: space.sm },
  label: { paddingHorizontal: space.lg, letterSpacing: 1.2 },
  row: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  pad: { paddingHorizontal: space.lg },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  toggleLabel: { flex: 1 },
  actions: { gap: space.sm, paddingHorizontal: space.lg },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
});
