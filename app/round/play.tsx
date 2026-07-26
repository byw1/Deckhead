import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { remainingMs } from '@/game/round';
import type { Outcome } from '@/game/types';
import { WARNING_SECONDS } from '@/game/types';
import { useRoundScreenMode } from '@/hooks/useRoundScreenMode';
import { useHaptics } from '@/hooks/useHaptics';
import { useSessionStore } from '@/hooks/useSessionStore';
import { useSettings } from '@/hooks/useSettings';
import { CardFace } from '@/ui/CardFace';
import { FlashOverlay } from '@/ui/FlashOverlay';
import { TimerBar } from '@/ui/TimerBar';
import { color, flashMs, font, space } from '@/ui/tokens';

const TICK_MS = 100;

/**
 * The round.
 *
 * Top half of the screen is correct, bottom half is pass. The holder cannot see
 * the screen, so the targets are half the display each and positionally
 * obvious — no small buttons anywhere.
 */
export default function RoundPlayScreen() {
  const router = useRouter();
  const settings = useSettings();
  const haptics = useHaptics();

  const state = useSessionStore((s) => s.roundState);
  const begin = useSessionStore((s) => s.start);
  const resolve = useSessionStore((s) => s.resolve);
  const pauseRound = useSessionStore((s) => s.pauseRound);
  const resumeRound = useSessionStore((s) => s.resumeRound);
  const tick = useSessionStore((s) => s.tick);

  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<Outcome | null>(null);
  const warned = useRef(false);
  const endSignalled = useRef(false);

  useRoundScreenMode({ landscape: true, boostBrightness: settings.boostBrightness });

  // Start on mount. The intro screen owns the countdown, so by the time this
  // renders the phone is already on a forehead.
  useEffect(() => {
    if (state.phase === 'intro') begin(Date.now());
  }, [begin, state.phase]);

  useEffect(() => {
    const id = setInterval(() => {
      const at = Date.now();
      setNow(at);
      tick(at);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [tick]);

  /**
   * An incoming call backgrounds the app. The timer pauses rather than running
   * down while nobody can see the screen, and the round resumes on return.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') resumeRound(Date.now());
      else pauseRound(Date.now());
    });
    return () => subscription.remove();
  }, [pauseRound, resumeRound]);

  const left = remainingMs(state, now);

  useEffect(() => {
    if (state.phase !== 'running') return;
    if (warned.current) return;
    if (left <= WARNING_SECONDS * 1_000) {
      warned.current = true;
      haptics.warning();
    }
  }, [haptics, left, state.phase]);

  useEffect(() => {
    if (state.phase !== 'ended' || endSignalled.current) return;
    endSignalled.current = true;
    haptics.timeUp();

    // Let the final flash land before the recap replaces the screen.
    const id = setTimeout(() => router.replace('/round/recap'), flashMs + 250);
    return () => clearTimeout(id);
  }, [haptics, router, state.phase]);

  const onResolve = useCallback(
    (outcome: Outcome) => {
      if (state.phase !== 'running') return;

      if (outcome === 'correct') haptics.correct();
      else haptics.pass();

      resolve(outcome, Date.now());
      setFlash(outcome);
      setTimeout(() => setFlash(null), flashMs);
    },
    [haptics, resolve, state.phase],
  );

  if (state.phase === 'paused') {
    return (
      <Pressable style={styles.paused} onPress={() => resumeRound(Date.now())}>
        <Text style={styles.pausedTitle} allowFontScaling={false}>
          PAUSED
        </Text>
        <Text style={styles.pausedBody}>
          {Math.ceil(left / 1000)} seconds left. Tap anywhere to carry on.
        </Text>
      </Pressable>
    );
  }

  const card = state.card;
  const accent = card?.accentColor ?? color.ink;
  const fraction = state.durationMs === 0 ? 0 : left / state.durationMs;
  const warning = left <= WARNING_SECONDS * 1_000;

  return (
    <View style={styles.screen}>
      <View style={[styles.card, { backgroundColor: accent }]}>
        <TimerBar fraction={fraction} warning={warning} />
        {card ? (
          <CardFace text={card.text} accentColor={accent} />
        ) : (
          <View style={styles.blank} />
        )}
      </View>

      {/* Half the screen each. The holder is aiming by position, not by sight. */}
      <View style={styles.hitAreas} pointerEvents="box-none">
        <Pressable
          style={styles.hitArea}
          onPress={() => onResolve('correct')}
          accessibilityRole="button"
          accessibilityLabel="Got it"
        />
        <Pressable
          style={styles.hitArea}
          onPress={() => onResolve('pass')}
          accessibilityRole="button"
          accessibilityLabel="Pass"
        />
      </View>

      {flash ? <FlashOverlay outcome={flash} /> : null}

      {state.phase === 'ended' ? (
        <View style={styles.timeUp} pointerEvents="none">
          <Text style={styles.timeUpText} allowFontScaling={false}>
            TIME
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ink,
  },
  card: {
    ...StyleSheet.absoluteFill,
  },
  blank: {
    flex: 1,
  },
  hitAreas: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'column',
  },
  hitArea: {
    flex: 1,
  },
  paused: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ink,
    gap: space.sm,
  },
  pausedTitle: {
    fontFamily: font.card,
    fontSize: 64,
    lineHeight: 70,
    color: color.bone,
  },
  pausedBody: {
    fontSize: 17,
    lineHeight: 24,
    color: color.inkMuted,
  },
  timeUp: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.ink,
    zIndex: 20,
  },
  timeUpText: {
    fontFamily: font.card,
    fontSize: 120,
    lineHeight: 128,
    color: color.bone,
  },
});
