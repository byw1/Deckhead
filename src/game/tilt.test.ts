import {
  defaultTiltConfig,
  initialTiltState,
  isArmed,
  resetTilt,
  stepTilt,
  type TiltState,
} from './tilt';
import type { Outcome } from './types';

/**
 * The spec singles out unreliable gyro controls as the incumbent's worst
 * failure, so these tests are mostly about what must NOT fire.
 */

const config = defaultTiltConfig;

/** Feeds a series of readings and collects what fired. */
function run(
  readings: { signal: number; at: number }[],
  from: TiltState = initialTiltState,
): { fired: Outcome[]; state: TiltState } {
  let state = from;
  const fired: Outcome[] = [];

  for (const reading of readings) {
    const step = stepTilt(state, reading.signal, reading.at, config);
    state = step.state;
    if (step.fired) fired.push(step.fired);
  }

  return { fired, state };
}

/** A tilt held steady at `signal` for `ms`, sampled at 50Hz from `from`. */
function hold(signal: number, ms: number, from = 0) {
  const readings: { signal: number; at: number }[] = [];
  for (let t = 0; t <= ms; t += 20) readings.push({ signal, at: from + t });
  return readings;
}

describe('resolving a card', () => {
  it('fires correct on a sustained forward tilt', () => {
    const { fired } = run(hold(-0.8, config.holdMs + 60));
    expect(fired).toEqual(['correct']);
  });

  it('fires pass on a sustained backward tilt', () => {
    const { fired } = run(hold(0.8, config.holdMs + 60));
    expect(fired).toEqual(['pass']);
  });

  it('fires once, not once per reading', () => {
    const { fired } = run(hold(-0.8, 2_000));
    expect(fired).toEqual(['correct']);
  });

  it('fires as soon as the hold completes, not later', () => {
    let state = initialTiltState;
    let firedAt: number | null = null;

    for (let t = 0; t <= 400; t += 10) {
      const step = stepTilt(state, -0.8, t, config);
      state = step.state;
      if (step.fired && firedAt === null) firedAt = t;
    }

    expect(firedAt).toBeGreaterThanOrEqual(config.holdMs);
    expect(firedAt).toBeLessThan(config.holdMs + 20);
  });
});

describe('what must not fire', () => {
  /** The spec's explicit requirement. */
  it('ignores a single excited jerk', () => {
    const { fired } = run([
      { signal: 0, at: 0 },
      { signal: -0.9, at: 20 },
      { signal: -0.95, at: 40 },
      { signal: -0.3, at: 60 },
      { signal: 0, at: 80 },
    ]);

    expect(fired).toEqual([]);
  });

  it('ignores repeated shaking', () => {
    const readings: { signal: number; at: number }[] = [];
    for (let t = 0; t < 3_000; t += 25) {
      readings.push({ signal: Math.sin(t / 40) * 0.95, at: t });
    }

    expect(run(readings).fired).toEqual([]);
  });

  it('ignores resting wobble', () => {
    const readings: { signal: number; at: number }[] = [];
    for (let t = 0; t < 5_000; t += 20) {
      readings.push({ signal: Math.sin(t / 300) * 0.15, at: t });
    }

    expect(run(readings).fired).toEqual([]);
  });

  it('ignores a tilt that stops just short of the threshold', () => {
    const { fired } = run(hold(-(config.fireThreshold - 0.01), 2_000));
    expect(fired).toEqual([]);
  });

  it('ignores a swing that passes through both directions without settling', () => {
    const { fired } = run([
      ...hold(-0.8, 80),
      ...hold(0.8, 80, 100),
      ...hold(-0.8, 80, 200),
    ]);

    expect(fired).toEqual([]);
  });

  it('does not fire on the swing back after a resolve', () => {
    // Tilt forward, resolve, then whip back past the opposite threshold.
    const { fired } = run([...hold(-0.8, 200), ...hold(0.9, 120, 220)]);
    expect(fired).toEqual(['correct']);
  });
});

describe('return to neutral', () => {
  it('will not fire again until the device comes back near level', () => {
    const { fired } = run([
      ...hold(-0.8, 200),
      // Held past the cooldown but never brought back level.
      ...hold(-0.8, 3_000, 220),
    ]);

    expect(fired).toEqual(['correct']);
  });

  it('fires again after levelling out', () => {
    const { fired } = run([
      ...hold(-0.8, 200),
      ...hold(0.02, 600, 220),
      ...hold(-0.8, 200, 900),
    ]);

    expect(fired).toEqual(['correct', 'correct']);
  });

  it('handles a run of alternating deliberate answers', () => {
    let at = 0;
    const readings: { signal: number; at: number }[] = [];

    for (const signal of [-0.8, 0.8, -0.8, 0.8]) {
      readings.push(...hold(signal, 200, at));
      at += 220;
      readings.push(...hold(0.0, 500, at));
      at += 520;
    }

    expect(run(readings).fired).toEqual(['correct', 'pass', 'correct', 'pass']);
  });

  it('needs a fuller return than the fire threshold, so the edge does not chatter', () => {
    const { fired } = run([
      ...hold(-0.8, 200),
      // Back under the fire threshold but not to neutral.
      ...hold(-0.3, 800, 220),
      ...hold(-0.8, 200, 1_040),
    ]);

    expect(fired).toEqual(['correct']);
  });
});

describe('arming state, for the on-screen prompt', () => {
  it('is armed at rest', () => {
    expect(isArmed(initialTiltState)).toBe(true);
  });

  it('is not armed straight after a resolve', () => {
    const { state } = run(hold(-0.8, 200));
    expect(isArmed(state)).toBe(false);
  });

  it('is armed again once level', () => {
    const { state } = run([...hold(-0.8, 200), ...hold(0.0, 600, 220)]);
    expect(isArmed(state)).toBe(true);
  });
});

describe('resetting between cards', () => {
  /** A tilt aimed at the last card must not resolve the next one. */
  it('requires a return to neutral after a reset', () => {
    const after = resetTilt(0);
    expect(isArmed(after)).toBe(false);

    const stillTilted = run(hold(-0.9, 2_000, 10), after);
    expect(stillTilted.fired).toEqual([]);

    const levelled = run([...hold(0.0, 300, 10), ...hold(-0.9, 200, 320)], after);
    expect(levelled.fired).toEqual(['correct']);
  });
});

describe('robustness', () => {
  it('survives out-of-range and non-finite readings without firing spuriously', () => {
    for (const signal of [5, -5, 0, Number.MIN_VALUE]) {
      expect(() => run(hold(signal, 100))).not.toThrow();
    }

    // NaN compares false against every threshold, so it must simply do nothing.
    const { fired } = run([
      { signal: Number.NaN, at: 0 },
      { signal: Number.NaN, at: 500 },
    ]);
    expect(fired).toEqual([]);
  });

  it('does not fire when readings arrive out of order', () => {
    const { fired } = run([
      { signal: -0.8, at: 1_000 },
      { signal: -0.8, at: 20 },
      { signal: -0.8, at: 40 },
    ]);

    expect(fired).toEqual([]);
  });

  it('handles a sparse sample rate', () => {
    // A slow device might only deliver a few readings during the hold.
    const { fired } = run([
      { signal: -0.8, at: 0 },
      { signal: -0.8, at: 200 },
    ]);

    expect(fired).toEqual(['correct']);
  });
});
