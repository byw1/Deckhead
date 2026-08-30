/**
 * Tilt input.
 *
 * Opt-in, never the default. The single most common complaint about the
 * incumbent is unreliable gyro controls, so the bar here is that a gesture must
 * be harder to make by accident than it is to make on purpose.
 *
 * Three guards, because this is a party game and the phone gets waved about:
 *
 * 1. **A deliberate threshold.** The screen has to swing well past vertical,
 *    not merely wobble on a forehead.
 * 2. **Return to neutral.** After a gesture the phone must come back near
 *    upright before another one registers, so holding it tilted resolves one
 *    card rather than the whole deck.
 * 3. **A dwell and a motion gate.** The tilt has to hold for a moment, and a
 *    sample whose magnitude is far from 1g is the phone being thrown around
 *    rather than held still at an angle. An excited jerk fails both.
 *
 * Pure and frame-agnostic: samples in, gestures out. Nothing here knows about
 * expo-sensors or React, so the thresholds are unit-testable without a device.
 */

export type TiltGesture = 'correct' | 'pass';

/** A raw accelerometer sample in g, in the device frame. */
export type Acceleration = {
  x: number;
  y: number;
  z: number;
};

export type TiltState = {
  /** Whether a gesture may fire. False until the phone is seen near upright. */
  armed: boolean;
  /** The gesture currently being held, if any. */
  pending: TiltGesture | null;
  /** When the current hold began, for the dwell. */
  pendingSince: number | null;
};

/**
 * How far the screen normal must swing from vertical to count, as a fraction of
 * gravity. 0.6 is about 37 degrees off upright — past anything a phone does
 * resting against a forehead.
 */
export const TILT_TRIGGER = 0.6;

/**
 * How close to upright the phone must return before another gesture registers.
 * Well inside the trigger, so the two cannot chatter against each other.
 */
export const TILT_NEUTRAL = 0.25;

/** How long the tilt must hold past the trigger before it fires. */
export const TILT_DWELL_MS = 120;

/**
 * How far a sample's magnitude may stray from 1g and still be treated as the
 * phone being held rather than swung. Gravity alone reads 1g; a jerk does not.
 */
export const TILT_MOTION_TOLERANCE = 0.35;

/**
 * Which way "tilted down" reads on the screen-normal axis.
 *
 * The round is landscape with the screen vertical and facing the room, so
 * gravity sits almost entirely off this axis at rest and swings onto it as the
 * phone is tipped. On iOS a device lying screen-up reads z = -1, so a screen
 * tipped to face the floor reads z = +1 — which is the "down" of "tilt down for
 * got it". If a device ever reads inverted, this constant is the only line that
 * needs to change.
 */
export const TILT_DOWN_SIGN = 1;

/**
 * Disarmed to begin with, deliberately. The phone is still on its way to a
 * forehead when the round opens, and that journey passes through angles well
 * past the trigger. Nothing fires until it has been seen near upright once.
 */
export function initialTiltState(): TiltState {
  return { armed: false, pending: null, pendingSince: null };
}

export type TiltStep = {
  state: TiltState;
  /** Set on the sample that completes a gesture, null on every other sample. */
  gesture: TiltGesture | null;
};

function gestureFor(axis: number): TiltGesture | null {
  if (axis >= TILT_TRIGGER) return 'correct';
  if (axis <= -TILT_TRIGGER) return 'pass';
  return null;
}

function idle(state: TiltState): TiltStep {
  return { state: { ...state, pending: null, pendingSince: null }, gesture: null };
}

/**
 * Advances the machine by one accelerometer sample.
 *
 * Returns the next state and, on the sample that completes a gesture, the
 * gesture itself. Callers hold the state and feed it back in.
 */
export function stepTilt(state: TiltState, reading: Acceleration, now: number): TiltStep {
  const magnitude = Math.hypot(reading.x, reading.y, reading.z);

  // The phone is being moved, not held at an angle. Drop the hold rather than
  // letting a swing accumulate dwell.
  if (Math.abs(magnitude - 1) > TILT_MOTION_TOLERANCE) return idle(state);

  const axis = reading.z * TILT_DOWN_SIGN;

  if (!state.armed) {
    // Back near upright re-arms. Until then nothing can fire, however far the
    // phone is tilted.
    if (Math.abs(axis) <= TILT_NEUTRAL) {
      return { state: { armed: true, pending: null, pendingSince: null }, gesture: null };
    }
    return idle(state);
  }

  const candidate = gestureFor(axis);
  if (candidate === null) return idle(state);

  // A new direction restarts the clock, so swinging through one gesture on the
  // way to the other does not bank time toward either.
  if (state.pending !== candidate || state.pendingSince === null) {
    return { state: { ...state, pending: candidate, pendingSince: now }, gesture: null };
  }

  if (now - state.pendingSince < TILT_DWELL_MS) return { state, gesture: null };

  // Fires once, then waits for neutral before it will fire again.
  return { state: { armed: false, pending: null, pendingSince: null }, gesture: candidate };
}
