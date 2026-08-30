import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useHaptics } from '@/hooks/useHaptics';
import { useSettings, useSettingsStore } from '@/hooks/useSettings';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

/**
 * App settings, as opposed to the per-game settings in the new game flow.
 *
 * These are preferences about the device and the person holding it, so they
 * persist across games rather than being chosen again every time.
 *
 * There is deliberately no sound toggle yet. The spec asks for one, off by
 * default, with a line explaining why — but nothing in the app plays audio, so
 * the control would be a switch wired to nothing. It lands with the sound it
 * governs. The stored setting already exists in useSettings for that day.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const haptics = useHaptics();
  const settings = useSettings();
  const set = useSettingsStore((s) => s.set);
  const resetAll = useSettingsStore((s) => s.resetAll);

  const confirmReset = () => {
    Alert.alert('Reset settings?', 'Input, haptics and brightness go back to their defaults. Your decks and games are not touched.', [
      { text: 'Keep', style: 'cancel' },
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

  return (
    <Screen>
      <View style={styles.backBar}>
        <Pressable
          onPress={router.back}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
          hitSlop={space.md}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <Text variant="label" tone="muted">
            Home
          </Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text card variant="title">
          SETTINGS
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Section
          label="INPUT"
          help={
            settings.inputMode === 'tap'
              ? 'Top half of the screen is got it, bottom half is pass.'
              : 'Tilt down for got it, up for pass. Tilt replaces tap for the whole round, so a hand resting on the screen cannot answer for you.'
          }
        >
          <Chip
            label="Tap"
            selected={settings.inputMode === 'tap'}
            onPress={() => {
              haptics.select();
              set('inputMode', 'tap');
            }}
            accessibilityLabel="Tap to answer"
          />
          <Chip
            label="Tilt"
            selected={settings.inputMode === 'tilt'}
            onPress={() => {
              haptics.select();
              set('inputMode', 'tilt');
            }}
            accessibilityLabel="Tilt to answer"
          />
        </Section>

        <Section
          label="HAPTICS"
          help="The phone talking to the hand it is held against. The holder cannot see the screen, so this is most of what they get."
        >
          <Chip
            label="On"
            selected={settings.haptics}
            onPress={() => {
              set('haptics', true);
              // Fired after the change so turning them on demonstrates itself.
              haptics.select();
            }}
            accessibilityLabel="Haptics on"
          />
          <Chip
            label="Off"
            selected={!settings.haptics}
            onPress={() => {
              haptics.select();
              set('haptics', false);
            }}
            accessibilityLabel="Haptics off"
          />
        </Section>

        <Section
          label="BRIGHTNESS"
          help="Pushes the screen toward maximum for a round so the card reads across a dim room, then puts it back where it was."
        >
          <Chip
            label="Boost"
            selected={settings.boostBrightness}
            onPress={() => {
              haptics.select();
              set('boostBrightness', true);
            }}
            accessibilityLabel="Boost brightness during a round"
          />
          <Chip
            label="Leave it"
            selected={!settings.boostBrightness}
            onPress={() => {
              haptics.select();
              set('boostBrightness', false);
            }}
            accessibilityLabel="Leave brightness alone"
          />
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Reset settings"
          onPress={confirmReset}
          accessibilityHint="Puts input, haptics and brightness back to their defaults"
        />
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
  help: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text variant="caption" tone="faint" style={styles.label}>
        {label}
      </Text>
      <View style={styles.row}>{children}</View>
      <Text variant="caption" tone="muted" style={styles.help}>
        {help}
      </Text>
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
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
  body: { paddingBottom: space.xl, gap: space.lg },
  section: { gap: space.sm },
  label: { paddingHorizontal: space.lg, letterSpacing: 1.2 },
  row: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, flexWrap: 'wrap' },
  help: { paddingHorizontal: space.lg },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
