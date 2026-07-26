import { StyleSheet, View } from 'react-native';
import { color } from './tokens';

export type TimerBarProps = {
  /** 1 at the start of the round, 0 at the end. */
  fraction: number;
  /** Turns the bar to the pass colour in the closing seconds. */
  warning?: boolean;
};

/**
 * A thin bar along the top edge, not a number.
 *
 * The spec is explicit that the timer must not compete with the word. A bar
 * reads as "how much is left" from across the room without anyone parsing
 * digits, and it does not distract the holder, who cannot see it anyway.
 */
export function TimerBar({ fraction, warning = false }: TimerBarProps) {
  const clamped = Math.min(1, Math.max(0, fraction));

  return (
    <View style={styles.track} pointerEvents="none">
      <View
        style={[
          styles.fill,
          { width: `${clamped * 100}%`, backgroundColor: warning ? color.pass : color.bone },
        ]}
      />
    </View>
  );
}

export const TIMER_BAR_HEIGHT = 6;

const styles = StyleSheet.create({
  track: {
    height: TIMER_BAR_HEIGHT,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
  },
  fill: {
    height: '100%',
  },
});
