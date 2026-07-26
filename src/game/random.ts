/**
 * Seeded randomness.
 *
 * Card drawing has to be testable, which means it cannot call Math.random
 * directly. A seeded generator also makes a session reproducible, which is
 * what lets a resumed session in M3 continue drawing the same sequence it
 * would have drawn had the app never closed.
 */

export type Random = () => number;

/** mulberry32. Small, fast, and good enough for shuffling a few hundred cards. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. Returns a new array; does not mutate the input. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A seed derived from a string, so a session id can drive its own shuffle. */
export function seedFromString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
