import { Pressable, StyleSheet, View } from 'react-native';
import type { DeckSummary } from '@/decks/types';
import { summaryIsPlayable } from '@/decks/types';
import { readableTextOn } from './contrast';
import { Text } from './Text';
import { color, radius, space } from './tokens';

export type DeckCardProps = {
  deck: DeckSummary;
  onPress: () => void;
};

/**
 * A deck row in the browser.
 *
 * The accent colour is shown as a solid block rather than a swatch, because it
 * is what the card will actually look like at arm's length and that is the
 * useful thing to preview.
 */
export function DeckCard({ deck, onPress }: DeckCardProps) {
  const playable = summaryIsPlayable(deck);
  const accentText = readableTextOn(deck.accentColor);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${deck.name}, ${deck.cardCount} ${deck.cardCount === 1 ? 'card' : 'cards'}`}
      accessibilityHint={playable ? undefined : 'Not enough cards to start a round'}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.accent, { backgroundColor: deck.accentColor }]}>
        <Text card variant="heading" style={[styles.accentInitial, { color: accentText }]}>
          {[...deck.name][0]?.toUpperCase() ?? '?'}
        </Text>
      </View>

      <View style={styles.body}>
        <Text variant="heading" numberOfLines={1}>
          {deck.name}
        </Text>
        {deck.description ? (
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {deck.description}
          </Text>
        ) : null}
        <Text variant="caption" tone={playable ? 'faint' : 'muted'}>
          {deck.cardCount} {deck.cardCount === 1 ? 'card' : 'cards'}
          {playable ? '' : ' · too few to play'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
  },
  pressed: {
    backgroundColor: color.surface,
  },
  accent: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentInitial: {
    fontSize: 26,
    lineHeight: 32,
  },
  body: {
    flex: 1,
    gap: 2,
  },
});
