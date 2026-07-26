import {
  buildPool,
  cardKey,
  createPool,
  drawNext,
  emptyDrawerState,
  poolCardKey,
  remainingInPool,
  type DrawerState,
  type PoolCard,
} from './cardDrawer';
import { seededRandom } from './random';

function deck(id: string, accentColor: string, count: number, prefix = 'card') {
  return {
    id,
    accentColor,
    cards: Array.from({ length: count }, (_, i) => ({
      id: `crd_${id}_${i}`,
      text: `${prefix} ${i}`,
      note: null,
    })),
  };
}

function drawAll(pool: readonly PoolCard[], count: number, from: DrawerState = emptyDrawerState) {
  const cards: PoolCard[] = [];
  const reshuffles: number[] = [];
  let state = from;

  for (let i = 0; i < count; i += 1) {
    const draw = drawNext(pool, state);
    if (!draw) break;
    cards.push(draw.card);
    if (draw.reshuffled) reshuffles.push(i);
    state = draw.state;
  }

  return { cards, state, reshuffles };
}

describe('pool building', () => {
  it('includes every card from every deck', () => {
    const pool = buildPool([deck('a', '#FF3D6E', 10), deck('b', '#2BD576', 5)], {
      shuffleAcrossDecks: true,
      random: seededRandom(1),
    });
    expect(pool).toHaveLength(15);
  });

  it('carries the deck accent colour on each card', () => {
    const pool = buildPool([deck('a', '#FF3D6E', 3), deck('b', '#2BD576', 3)], {
      shuffleAcrossDecks: false,
      random: seededRandom(1),
    });
    expect(pool.filter((c) => c.deckId === 'a').every((c) => c.accentColor === '#FF3D6E')).toBe(true);
    expect(pool.filter((c) => c.deckId === 'b').every((c) => c.accentColor === '#2BD576')).toBe(true);
  });

  it('keeps decks in blocks when not shuffling across them', () => {
    const pool = buildPool([deck('a', '#FF3D6E', 5), deck('b', '#2BD576', 5)], {
      shuffleAcrossDecks: false,
      random: seededRandom(7),
    });
    expect(pool.slice(0, 5).every((c) => c.deckId === 'a')).toBe(true);
    expect(pool.slice(5).every((c) => c.deckId === 'b')).toBe(true);
  });

  it('interleaves decks when shuffling across them', () => {
    const pool = buildPool([deck('a', '#FF3D6E', 30), deck('b', '#2BD576', 30)], {
      shuffleAcrossDecks: true,
      random: seededRandom(7),
    });
    expect(pool.slice(0, 30).every((c) => c.deckId === 'a')).toBe(false);
  });

  it('is deterministic for a given seed', () => {
    const decks = [deck('a', '#FF3D6E', 20)];
    const first = createPool(decks, { seed: 42 });
    const second = createPool(decks, { seed: 42 });
    expect(first.map(poolCardKey)).toEqual(second.map(poolCardKey));
  });

  it('orders differently for different seeds', () => {
    const decks = [deck('a', '#FF3D6E', 30)];
    expect(createPool(decks, { seed: 1 }).map(poolCardKey)).not.toEqual(
      createPool(decks, { seed: 2 }).map(poolCardKey),
    );
  });

  it('handles an empty deck list and empty decks', () => {
    expect(buildPool([], { shuffleAcrossDecks: true, random: seededRandom(1) })).toEqual([]);
    expect(
      buildPool([deck('a', '#FF3D6E', 0)], { shuffleAcrossDecks: true, random: seededRandom(1) }),
    ).toEqual([]);
  });
});

describe('drawing without repeats', () => {
  it('never repeats a card while the pool lasts', () => {
    const pool = createPool([deck('a', '#FF3D6E', 50)], { seed: 3 });
    const { cards } = drawAll(pool, 50);

    expect(cards).toHaveLength(50);
    expect(new Set(cards.map(poolCardKey)).size).toBe(50);
  });

  it('draws every card in the pool exactly once', () => {
    const pool = createPool([deck('a', '#FF3D6E', 12), deck('b', '#2BD576', 8)], { seed: 5 });
    const { cards } = drawAll(pool, 20);
    expect(new Set(cards.map(poolCardKey))).toEqual(new Set(pool.map(poolCardKey)));
  });

  it('records each drawn card as seen', () => {
    const pool = createPool([deck('a', '#FF3D6E', 5)], { seed: 1 });
    const { cards, state } = drawAll(pool, 3);
    expect(state.seen).toEqual(cards.map(poolCardKey));
  });

  it('reports how many cards are left', () => {
    const pool = createPool([deck('a', '#FF3D6E', 10)], { seed: 1 });
    expect(remainingInPool(pool, emptyDrawerState)).toBe(10);

    const { state } = drawAll(pool, 4);
    expect(remainingInPool(pool, state)).toBe(6);
  });

  it('returns null only when the pool is genuinely empty', () => {
    expect(drawNext([], emptyDrawerState)).toBeNull();
  });

  it('skips cards already seen from an earlier round', () => {
    const pool = createPool([deck('a', '#FF3D6E', 10)], { seed: 1 });
    const alreadySeen = pool.slice(0, 6).map(poolCardKey);

    const { cards } = drawAll(pool, 4, { seen: alreadySeen, reshuffleCount: 0 });
    expect(cards.some((c) => alreadySeen.includes(poolCardKey(c)))).toBe(false);
  });
});

describe('recycling an exhausted pool', () => {
  it('reshuffles rather than running out mid-round', () => {
    const pool = createPool([deck('a', '#FF3D6E', 5)], { seed: 1 });
    const { cards, reshuffles } = drawAll(pool, 8);

    expect(cards).toHaveLength(8);
    expect(reshuffles).toEqual([5]);
  });

  it('clears the seen set when it recycles', () => {
    const pool = createPool([deck('a', '#FF3D6E', 3)], { seed: 1 });
    const { state } = drawAll(pool, 4);

    expect(state.seen).toHaveLength(1);
    expect(state.reshuffleCount).toBe(1);
  });

  it('counts each recycle, so the recap can say it happened', () => {
    const pool = createPool([deck('a', '#FF3D6E', 2)], { seed: 1 });
    const { state } = drawAll(pool, 7);
    expect(state.reshuffleCount).toBe(3);
  });

  it('does not report a reshuffle on an ordinary draw', () => {
    const pool = createPool([deck('a', '#FF3D6E', 10)], { seed: 1 });
    const { reshuffles } = drawAll(pool, 9);
    expect(reshuffles).toEqual([]);
  });

  it('works with a single-card pool', () => {
    const pool = createPool([deck('a', '#FF3D6E', 1)], { seed: 1 });
    const { cards, state } = drawAll(pool, 3);
    expect(cards).toHaveLength(3);
    expect(state.reshuffleCount).toBe(2);
  });
});

describe('card keys', () => {
  /**
   * The spec gap: card ids are only unique within a deck, so a duplicated deck
   * would share ids with its source. Keying on deckId/cardId is what stops one
   * deck marking the other's cards as seen.
   */
  it('keeps the same card id in two decks distinct', () => {
    const original = { id: 'a', accentColor: '#FF3D6E', cards: [{ id: 'crd_1', text: 'X', note: null }] };
    const duplicate = { id: 'b', accentColor: '#2BD576', cards: [{ id: 'crd_1', text: 'X', note: null }] };

    const pool = buildPool([original, duplicate], {
      shuffleAcrossDecks: false,
      random: seededRandom(1),
    });

    const { cards } = drawAll(pool, 2);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.deckId).sort()).toEqual(['a', 'b']);
  });

  it('composes deck and card id', () => {
    expect(cardKey('dck_1', 'crd_2')).toBe('dck_1/crd_2');
  });
});
