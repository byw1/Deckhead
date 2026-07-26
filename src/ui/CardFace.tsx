import { StyleSheet, Text, View } from 'react-native';
import { readableTextOn } from './contrast';
import { font } from './tokens';

export type CardFaceProps = {
  text: string;
  accentColor: string;
};

/**
 * The card. Not a card-shaped thing on a screen — the whole screen.
 *
 * No chrome, no container, full-bleed accent colour, text sized to fill the
 * width in the heavy condensed face. It is read at arm's length across a dim
 * room, so size beats everything.
 *
 * Sizing starts deliberately too large and lets the platform shrink to fit,
 * rather than measuring and recalculating. That keeps a long title and a short
 * one both filling the space, with no layout pass visible to the player.
 */
export function CardFace({ text, accentColor }: CardFaceProps) {
  const color = readableTextOn(accentColor);

  return (
    <View style={[styles.face, { backgroundColor: accentColor }]}>
      <Text
        style={[styles.text, { color }]}
        numberOfLines={3}
        adjustsFontSizeToFit
        minimumFontScale={0.15}
        allowFontScaling={false}
        accessibilityLabel={text}
      >
        {text.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  text: {
    fontFamily: font.card,
    // The starting size, shrunk to fit by the platform. High enough that a
    // short word fills a landscape screen.
    fontSize: 200,
    lineHeight: 200,
    textAlign: 'center',
  },
});
