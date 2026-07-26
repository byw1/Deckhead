import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';

export type RoundScreenModeOptions = {
  /** Lock landscape. The round flow stays sideways from intro through recap. */
  landscape?: boolean;
  /** Push brightness toward max. Only the round itself needs this. */
  boostBrightness?: boolean;
};

/**
 * Puts the device into round mode and puts it back afterwards.
 *
 * Landscape locked, screen kept awake, brightness pushed toward max so the card
 * reads across a dim room. Everything is reversed on unmount: leaving a phone
 * at full brightness and unable to sleep after a party game is a battery
 * complaint waiting to happen.
 *
 * Brightness is restored to the value read on entry rather than to the system
 * setting, because restoreSystemBrightnessAsync is Android-only and this is an
 * iOS-first app.
 */
export function useRoundScreenMode({
  landscape = true,
  boostBrightness = false,
}: RoundScreenModeOptions = {}): void {
  useKeepAwake();

  useEffect(() => {
    if (!landscape) return;

    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(
      // A device that refuses the lock still plays fine in whatever orientation
      // it is already in. Not worth failing a round over.
      () => undefined,
    );

    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(
        () => undefined,
      );
    };
  }, [landscape]);

  useEffect(() => {
    if (!boostBrightness) return;

    let cancelled = false;
    let previous: number | null = null;

    void (async () => {
      try {
        const current = await Brightness.getBrightnessAsync();
        if (cancelled) return;
        previous = current;
        await Brightness.setBrightnessAsync(1);
      } catch {
        // Brightness needs a permission on some platforms. Without it the round
        // still works, it is just dimmer.
      }
    })();

    return () => {
      cancelled = true;
      if (previous !== null) {
        void Brightness.setBrightnessAsync(previous).catch(() => undefined);
      }
    };
  }, [boostBrightness]);
}
