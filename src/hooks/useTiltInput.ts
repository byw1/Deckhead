import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { initialTiltState, isArmed, resetTilt, stepTilt, type TiltState } from '@/game/tilt';
import type { Outcome } from '@/game/types';

/**
 * Tilt input for the round screen.
 *
 * All the judgement lives in the pure detector in /src/game/tilt. This is the
 * sensor subscription and nothing else.
 *
 * The signal is the accelerometer's z component: gravity perpendicular to the
 * screen. Held upright against a forehead that reads near zero, and nodding
 * the phone swings it toward ±1, which is the same whichever way up the phone
 * is held in landscape.
 */

const SAMPLE_INTERVAL_MS = 50;

export type TiltInput = {
  /** True when a new tilt could resolve the card. */
  armed: boolean;
  /** False when the sensor is unavailable, so the screen can say so. */
  available: boolean;
};

export function useTiltInput(options: {
  enabled: boolean;
  onResolve: (outcome: Outcome) => void;
  /** Changes per card, so one tilt cannot resolve two of them. */
  resetKey: string | number;
}): TiltInput {
  const { enabled, onResolve, resetKey } = options;

  const [armed, setArmed] = useState(true);
  const [available, setAvailable] = useState(true);

  const detector = useRef<TiltState>(initialTiltState);
  const resolve = useRef(onResolve);

  // Kept current in an effect rather than during render, so the subscription
  // below can depend only on `enabled` without going stale.
  useEffect(() => {
    resolve.current = onResolve;
  }, [onResolve]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    void Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });

    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);

    const subscription = Accelerometer.addListener(({ z }) => {
      const step = stepTilt(detector.current, z, Date.now());
      detector.current = step.state;

      setArmed(isArmed(step.state));
      if (step.fired) resolve.current(step.fired);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [enabled]);

  /**
   * A new card starts needing a return to neutral, so the tilt that answered
   * the last card cannot carry into this one.
   *
   * Only the ref is touched here. The next sensor reading — at most one sample
   * away — reports the new arming state, which avoids a synchronous setState
   * in an effect and is imperceptible either way.
   */
  useEffect(() => {
    detector.current = resetTilt(Date.now());
  }, [resetKey]);

  return { armed, available };
}
