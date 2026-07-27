import type { Outcome } from './types';

/**
 * Tilt detection.
 *
 * The single most common complaint about the incumbent is unreliable gyro
 * controls, so this is deliberately hard to trigger by accident. Four things
 * have to happen before a tilt counts:
 *
 *   1. The device passes a threshold well past any resting wobble.
 *   2. It stays past that threshold for a sustained period. A single excited
 *      jerk crosses and returns inside that window and is ignored.
 *   3. Nothing at all is read for a cooldown after a resolve, so the swing back
 *      cannot register as the opposite answer.
 *   4. The device returns to near level before another tilt is possible.
 *
 * Pure, so all of that is testable without a device on a forehead.
 *
 * The signal is the gravity component perpendicular to the screen. Held
 * upright against a forehead it reads near zero, and nodding the phone forward
 * or back swings it toward ±1. That axis is unaffected by which way up the
 * phone is held in landscape, which the roll and pitch angles are not.
 */

export type TiltConfig = {
  /** Magnitude that counts as a deliberate tilt. */
  fireThreshold: number;
  /** Magnitude the device must fall back under before another tilt can fire. */
  neutralThreshold: number;
  /** How long the tilt must be held. This is what rejects a jerk. */
  holdMs: number;
  /** Dead time after a resolve, covering the swing back. */
  cooldownMs: number;
};

export const defaultTiltConfig: TiltConfig = {
  fireThreshold: 0.45,
  neutralThreshold: 0.2,
  holdMs: 130,
  cooldownMs: 400,
};

export type TiltPhase = 'neutral' | 'tilting' | 'cooldown' | 'awaitNeutral';

export type TiltState = {
  phase: TiltPhase;
  /** Which way the current tilt is going, while one is in progress. */
  direction: Outcome | null;
  /** When the current phase began. */
  since: number;
};

export const initialTiltState: TiltState = { phase: 'neutral', direction: null, since: 0 };

export type TiltStep = {
  state: TiltState;
  /** Set on the single reading that completes a tilt. */
  fired: Outcome | null;
};

/**
 * Which way a tilt reads.
 *
 * Nodding the phone forward — the natural "yes, got it" movement with a phone
 * on your forehead — pushes the signal negative. Tilting back reads as a pass.
 */
function directionOf(signal: number): Outcome {
  return signal < 0 ? 'correct' : 'pass';
}

/** Advances the detector by one sensor reading. */
export function stepTilt(
  state: TiltState,
  signal: number,
  atMs: number,
  config: TiltConfig = defaultTiltConfig,
): TiltStep {
  // A non-finite reading must be treated as no reading at all. Every threshold
  // comparison against NaN is false, so without this guard a glitched sample
  // walks straight past the "below threshold" checks and resolves a card.
  if (!Number.isFinite(signal)) return { state, fired: null };

  const magnitude = Math.abs(signal);

  switch (state.phase) {
    case 'neutral': {
      if (magnitude < config.fireThreshold) return { state, fired: null };
      return {
        state: { phase: 'tilting', direction: directionOf(signal), since: atMs },
        fired: null,
      };
    }

    case 'tilting': {
      // Fell back before the hold completed: a jerk, not an answer.
      if (magnitude < config.fireThreshold) {
        return { state: { phase: 'neutral', direction: null, since: atMs }, fired: null };
      }

      // Swung through level to the other side without settling. Restart rather
      // than crediting whichever side it happens to be on.
      if (directionOf(signal) !== state.direction) {
        return {
          state: { phase: 'tilting', direction: directionOf(signal), since: atMs },
          fired: null,
        };
      }

      if (atMs - state.since < config.holdMs) return { state, fired: null };

      return {
        state: { phase: 'cooldown', direction: null, since: atMs },
        fired: state.direction,
      };
    }

    case 'cooldown': {
      if (atMs - state.since < config.cooldownMs) return { state, fired: null };
      return { state: { phase: 'awaitNeutral', direction: null, since: atMs }, fired: null };
    }

    case 'awaitNeutral': {
      if (magnitude >= config.neutralThreshold) return { state, fired: null };
      return { state: { phase: 'neutral', direction: null, since: atMs }, fired: null };
    }
  }
}

/**
 * Whether the detector is ready for a new tilt.
 *
 * Drives the on-screen prompt: the holder cannot see it, but the group can,
 * and "bring it back level" is the thing they end up shouting otherwise.
 */
export function isArmed(state: TiltState): boolean {
  return state.phase === 'neutral' || state.phase === 'tilting';
}

/** Resets between cards, so a card never inherits a tilt aimed at the last one. */
export function resetTilt(atMs: number): TiltState {
  return { phase: 'awaitNeutral', direction: null, since: atMs };
}
