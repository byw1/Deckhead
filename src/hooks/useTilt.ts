import { Accelerometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { initialTiltState, stepTilt, type TiltGesture } from '@/game/tilt';

/**
 * Tilt input, wired to the accelerometer.
 *
 * The thresholds and the debouncing live in `@/game/tilt`, which is pure and
 * tested. This hook does the parts that need a device: subscribing, throttling,
 * and tearing the subscription down the moment tilt stops being the input mode.
 */

/**
 * Sample rate. Fast enough that a gesture feels immediate against the 120ms
 * dwell, slow enough not to run the accelerometer flat out for a whole round.
 */
const INTERVAL_MS = 50;

export type UseTiltOptions = {
  /** Subscribe only while tilt is the input mode and a round is running. */
  enabled: boolean;
  onGesture: (gesture: TiltGesture) => void;
};

export type UseTiltResult = {
  /**
   * False only once the device has told us it has no accelerometer. Assumed
   * true until then, so there is no window where the round accepts nothing.
   */
  available: boolean;
};

export function useTilt({ enabled, onGesture }: UseTiltOptions): UseTiltResult {
  const [available, setAvailable] = useState(true);

  // Held in a ref so a new callback identity each render does not tear down and
  // rebuild the subscription mid-round.
  const handler = useRef(onGesture);
  useEffect(() => {
    handler.current = onGesture;
  }, [onGesture]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    void Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      // A device that will not answer still gets the benefit of the doubt; the
      // listener below simply never fires and tap stays as it was.
      .catch(() => undefined);

    // Fresh state each time tilt is switched on, so a gesture cannot carry over
    // from an earlier round and the phone has to be seen upright again first.
    let state = initialTiltState();

    Accelerometer.setUpdateInterval(INTERVAL_MS);
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      const step = stepTilt(state, { x, y, z }, Date.now());
      state = step.state;
      if (step.gesture) handler.current(step.gesture);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [enabled]);

  return { available };
}
