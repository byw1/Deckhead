import { StyleSheet, Text, View } from 'react-native';
import type { Outcome } from '@/game/types';
import { readableTextOn } from './contrast';
import { color, font } from './tokens';

export type FlashOverlayProps = {
  outcome: Outcome;
};

/**
 * The full-screen state flash.
 *
 * This is the signature element. Correct and pass each take over the entire
 * display so the group reads the result from across the room without hunting
 * for a small indicator. Everything else in the app stays quiet so this can be
 * loud.
 *
 * The word is there for anyone who cannot rely on colour alone, and because a
 * flash of pure colour is ambiguous the first time you see it. Plain verbs, per
 * the copy rules: "Got it" and "Pass", not "Correct!" and "Skip!".
 */
export function FlashOverlay({ outcome }: FlashOverlayProps) {
  const background = outcome === 'correct' ? color.correct : color.pass;
  const label = outcome === 'correct' ? 'Got it' : 'Pass';

  return (
    <View
      style={[styles.overlay, { backgroundColor: background }]}
      pointerEvents="none"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={label}
    >
      <Text style={[styles.label, { color: readableTextOn(background) }]} allowFontScaling={false}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  label: {
    fontFamily: font.card,
    fontSize: 96,
    lineHeight: 104,
    textAlign: 'center',
  },
});
