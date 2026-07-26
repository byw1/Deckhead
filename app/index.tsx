import { StyleSheet, View } from 'react-native';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { space } from '@/ui/tokens';

export default function Home() {
  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text card variant="display">
          DECKHEAD
        </Text>
        <Text variant="body" tone="muted">
          Phone on your forehead. Everyone else shouts clues.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  header: {
    gap: space.sm,
  },
});
