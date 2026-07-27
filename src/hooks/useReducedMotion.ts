import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the device asks for reduced motion.
 *
 * The full-screen state flash is the app's signature element and cannot simply
 * be removed — it is how the group reads the result from across the room, and
 * it is information, not decoration. With reduced motion on it holds still and
 * a little longer instead of snapping in and out, which keeps the meaning and
 * loses the jolt.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduced(enabled);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
