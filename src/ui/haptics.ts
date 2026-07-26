import * as Haptics from 'expo-haptics';

/**
 * Haptic vocabulary.
 *
 * Haptics carry the signal, not sound. The holder cannot see the screen and
 * sound leaks the result across the room, so the phone talking to the hand it
 * is held against is the whole feedback channel.
 *
 * expo-haptics has no custom pattern API, so sequences are composed from
 * primitives on a timer. Every call is fire-and-forget: a failed haptic must
 * never interrupt a round, and haptics are a no-op in Low Power Mode and on
 * devices without a Taptic Engine.
 */

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Swallows errors — no haptic is ever worth breaking a round over. */
function fire(run: () => Promise<void>): void {
  void run().catch(() => undefined);
}

export type HapticsSettings = { enabled: boolean };

export function createHaptics(settings: HapticsSettings) {
  const guard = (run: () => Promise<void>) => {
    if (settings.enabled) fire(run);
  };

  return {
    /** Two short crisp pulses. */
    correct(): void {
      guard(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
        await wait(90);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      });
    },

    /** One long dull pulse. */
    pass(): void {
      guard(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
        await wait(60);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      });
    },

    /** Three light ticks at ten seconds remaining. */
    warning(): void {
      guard(async () => {
        for (let i = 0; i < 3; i += 1) {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          await wait(140);
        }
      });
    },

    /** Sustained heavy pattern when time is up. */
    timeUp(): void {
      guard(async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        for (let i = 0; i < 3; i += 1) {
          await wait(120);
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }
      });
    },

    /** Each beat of the 3-2-1 before a round. */
    countdownTick(): void {
      guard(async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      });
    },

    /** Menu-level acknowledgement. */
    select(): void {
      guard(async () => {
        await Haptics.selectionAsync();
      });
    },
  };
}

export type AppHaptics = ReturnType<typeof createHaptics>;
