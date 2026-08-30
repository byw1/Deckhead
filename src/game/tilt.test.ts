import {
  initialTiltState,
  stepTilt,
  TILT_DWELL_MS,
  TILT_NEUTRAL,
  TILT_TRIGGER,
  type Acceleration,
  type TiltGesture,
  type TiltState,
} from './tilt';

/** Upright on a forehead: gravity along the short edge, nothing on the normal. */
const UPRIGHT: Acceleration = { x: -1, y: 0, z: 0 };
/** Tipped past the trigger toward the floor. */
const DOWN: Acceleration = { x: -0.5, y: 0, z: 0.86 };
/** Tipped past the trigger toward the ceiling. */
const UP: Acceleration = { x: -0.5, y: 0, z: -0.86 };

/**
 * Feeds samples in and returns every gesture that came out, so tests can assert
 * on what a sequence of movement actually resolved.
 */
function play(
  samples: { reading: Acceleration; at: number }[],
  from: TiltState = initialTiltState(),
): { state: TiltState; gestures: TiltGesture[] } {
  let state = from;
  const gestures: TiltGesture[] = [];

  for (const { reading, at } of samples) {
    const step = stepTilt(state, reading, at);
    state = step.state;
    if (step.gesture) gestures.push(step.gesture);
  }

  return { state, gestures };
}

/** Holds a reading still for long enough to clear the dwell. */
function hold(reading: Acceleration, from = 0): { reading: Acceleration; at: number }[] {
  return [
    { reading, at: from },
    { reading, at: from + TILT_DWELL_MS },
  ];
}

/** Upright long enough to arm, then a held tilt. */
function armThen(reading: Acceleration): { reading: Acceleration; at: number }[] {
  return [{ reading: UPRIGHT, at: 0 }, ...hold(reading, 100)];
}

describe('stepTilt', () => {
  it('starts disarmed, so the trip to the forehead resolves nothing', () => {
    const { gestures } = play(hold(DOWN));
    expect(gestures).toEqual([]);
  });

  it('arms once the phone is seen near upright', () => {
    const { state } = play([{ reading: UPRIGHT, at: 0 }]);
    expect(state.armed).toBe(true);
  });

  it('resolves correct on a held tilt down', () => {
    const { gestures } = play(armThen(DOWN));
    expect(gestures).toEqual(['correct']);
  });

  it('resolves pass on a held tilt up', () => {
    const { gestures } = play(armThen(UP));
    expect(gestures).toEqual(['pass']);
  });

  it('does not fire until the tilt has been held for the dwell', () => {
    const { gestures } = play([
      { reading: UPRIGHT, at: 0 },
      { reading: DOWN, at: 100 },
      { reading: DOWN, at: 100 + TILT_DWELL_MS - 1 },
    ]);
    expect(gestures).toEqual([]);
  });

  it('ignores a tilt that springs back before the dwell is up', () => {
    const { gestures } = play([
      { reading: UPRIGHT, at: 0 },
      { reading: DOWN, at: 100 },
      { reading: UPRIGHT, at: 100 + TILT_DWELL_MS - 20 },
      { reading: UPRIGHT, at: 300 },
    ]);
    expect(gestures).toEqual([]);
  });

  it('fires once for a tilt that is held, not once per sample', () => {
    const { gestures } = play([
      { reading: UPRIGHT, at: 0 },
      ...hold(DOWN, 100),
      { reading: DOWN, at: 500 },
      { reading: DOWN, at: 900 },
      { reading: DOWN, at: 1_500 },
    ]);
    expect(gestures).toEqual(['correct']);
  });

  it('needs a return to neutral before the next card can resolve', () => {
    const { gestures } = play([
      { reading: UPRIGHT, at: 0 },
      ...hold(DOWN, 100),
      ...hold(DOWN, 400),
      { reading: UPRIGHT, at: 800 },
      ...hold(DOWN, 900),
    ]);
    expect(gestures).toEqual(['correct', 'correct']);
  });

  it('will not resolve the other way either until it returns to neutral', () => {
    const { gestures } = play([
      { reading: UPRIGHT, at: 0 },
      ...hold(DOWN, 100),
      ...hold(UP, 400),
    ]);
    expect(gestures).toEqual(['correct']);
  });

  it('ignores an excited jerk, however far past the trigger it swings', () => {
    // Same direction as a tilt down, but at 2.4g it is a swing, not a hold.
    const jerk: Acceleration = { x: -1.2, y: 0, z: 2.06 };
    const { gestures } = play([{ reading: UPRIGHT, at: 0 }, ...hold(jerk, 100)]);
    expect(gestures).toEqual([]);
  });

  it('does not bank dwell across a jerk in the middle of a hold', () => {
    const jerk: Acceleration = { x: -1.2, y: 0, z: 2.06 };
    const { gestures } = play([
      { reading: UPRIGHT, at: 0 },
      { reading: DOWN, at: 100 },
      { reading: jerk, at: 140 },
      { reading: DOWN, at: 100 + TILT_DWELL_MS },
    ]);
    expect(gestures).toEqual([]);
  });

  it('restarts the dwell when the phone swings through one gesture into the other', () => {
    const { gestures } = play([
      { reading: UPRIGHT, at: 0 },
      { reading: DOWN, at: 100 },
      { reading: UP, at: 100 + TILT_DWELL_MS },
    ]);
    expect(gestures).toEqual([]);
  });

  it('treats a wobble short of the trigger as nothing at all', () => {
    const wobble: Acceleration = { x: -0.97, y: 0, z: TILT_TRIGGER - 0.05 };
    const { gestures } = play([{ reading: UPRIGHT, at: 0 }, ...hold(wobble, 100)]);
    expect(gestures).toEqual([]);
  });

  it('does not re-arm on a lean that is still outside neutral', () => {
    const lean: Acceleration = { x: -0.97, y: 0, z: TILT_NEUTRAL + 0.05 };
    const { state } = play([...armThen(DOWN), { reading: lean, at: 600 }]);
    expect(state.armed).toBe(false);
  });
});
