import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, minTapTarget, radius, space } from '@/ui/tokens';

export default function HomeScreen() {
  const router = useRouter();

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
        <PrimaryAction label="New round" onPress={() => router.push('/play/setup')} emphasis />
        <PrimaryAction label="Decks" onPress={() => router.push('/decks')} />
        {/* Teams, win conditions and the multi-round loop arrive in M3, at
            which point this becomes "New game". */}
      </View>
    </Screen>
  );
}

function PrimaryAction({
  label,
  onPress,
  emphasis = false,
}: {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        emphasis && styles.actionEmphasis,
        pressed && (emphasis ? styles.actionEmphasisPressed : styles.actionPressed),
      ]}
    >
      <Text variant="heading">{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.xxl,
  },
  masthead: {
    gap: space.sm,
    paddingTop: space.xxl,
  },
  wordmark: {
    fontSize: 56,
    lineHeight: 60,
    color: color.brand,
  },
  actions: {
    gap: space.sm,
  },
  action: {
    minHeight: minTapTarget + space.md,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  actionPressed: {
    backgroundColor: color.surfaceRaised,
  },
  actionEmphasis: {
    backgroundColor: color.brand,
  },
  actionEmphasisPressed: {
    backgroundColor: color.brand,
    opacity: 0.85,
  },
});
