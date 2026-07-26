import { poolCardKey } from '@/game/cardDrawer';
import { useRoundStore } from './useRoundStore';

/**
 * The store is a thin shell over the pure state machine, so this covers the
 * wiring rather than the rules: that a round can be played start to finish
 * through the store, and that a recap override lands.
 */

const decks = [
  {
    id: 'dck_1',
    name: 'Test',
    accentColor: '#FF3D6E',
    cards: Array.from({ length: 20 }, (_, i) => ({
      id: `crd_${i}`,
      text: `Card ${i}`,
      note: null,
    })),
  },
];

const store = () => useRoundStore.getState();

beforeEach(() => {
  store().reset();
});

describe('round store', () => {
  it('plays a round from start to finish', () => {
    store().prepare(decks, { roundSeconds: 60, seed: 1 });
    expect(store().state.phase).toBe('intro');

    store().begin(0);
    expect(store().state.phase).toBe('running');
    expect(store().state.card).not.toBeNull();

    store().resolve('correct', 1_000);
    store().resolve('pass', 2_000);
    store().resolve('correct', 3_000);

    expect(store().state.results.map((r) => r.outcome)).toEqual(['correct', 'pass', 'correct']);

    store().finish(4_000);
    expect(store().state.phase).toBe('ended');
  });

  it('ends the round when the clock runs out', () => {
    store().prepare(decks, { roundSeconds: 30, seed: 1 });
    store().begin(0);

    store().tick(10_000);
    expect(store().state.phase).toBe('running');

    store().tick(30_000);
    expect(store().state.phase).toBe('ended');
  });

  it('pauses and resumes without losing time', () => {
    store().prepare(decks, { roundSeconds: 60, seed: 1 });
    store().begin(0);

    store().pause(10_000);
    expect(store().state.phase).toBe('paused');

    store().resume(60_000);
    store().resolve('correct', 65_000);

    expect(store().state.results[0]?.atMs).toBe(15_000);
  });

  it('flips a result from the recap', () => {
    store().prepare(decks, { roundSeconds: 60, seed: 1 });
    store().begin(0);

    const firstCard = store().state.card!;
    store().resolve('pass', 1_000);

    store().overrideResult(poolCardKey(firstCard), 'correct');
    expect(store().state.results[0]?.outcome).toBe('correct');
  });

  it('leaves other results alone when one is overridden', () => {
    store().prepare(decks, { roundSeconds: 60, seed: 1 });
    store().begin(0);

    const first = store().state.card!;
    store().resolve('correct', 1_000);
    store().resolve('correct', 2_000);

    store().overrideResult(poolCardKey(first), 'pass');
    expect(store().state.results.map((r) => r.outcome)).toEqual(['pass', 'correct']);
  });

  it('never deals the same card twice in a round', () => {
    store().prepare(decks, { roundSeconds: 600, seed: 9 });
    store().begin(0);

    for (let i = 0; i < 20; i += 1) store().resolve('correct', i * 100);

    const ids = store().state.results.map((r) => r.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('clears everything on reset, so the next round starts clean', () => {
    store().prepare(decks, { roundSeconds: 60, seed: 1 });
    store().begin(0);
    store().resolve('correct', 1_000);

    store().reset();

    expect(store().pool).toEqual([]);
    expect(store().state.results).toEqual([]);
    expect(store().deckNames).toEqual([]);
  });

  it('carries deck names through for the recap', () => {
    store().prepare(decks, { roundSeconds: 60, seed: 1 });
    expect(store().deckNames).toEqual(['Test']);
  });
});
