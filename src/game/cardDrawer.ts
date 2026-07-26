import { seededRandom, shuffle, type Random } from './random';

/**
 * Card drawing with no repeats.
 *
 * seenCardIds grows across the whole session. The drawer only recycles once the
 * combined pool is exhausted, and when it does it clears the seen set and
 * reports that it reshuffled, so the recap can say so.
 *
 * Cards are keyed by deckId/cardId rather than cardId alone. Card ids are only
 * unique within a deck, so a bare id would let a duplicated deck mark its
 * original's cards as seen.
 */

export type PoolCard = {
  deckId: string;
  cardId: string;
  text: string;
  note: string | null;
  /** Carried on the card so the round screen does not have to look up the deck. */
  accentColor: string;
};

export type DrawerState = {
  /** Composite deckId/cardId keys. */
  seen: readonly string[];
  /** How many times the pool has been exhausted and recycled. */
  reshuffleCount: number;
};

export type Draw = {
  card: PoolCard;
  state: DrawerState;
  /** True when this draw came after clearing an exhausted pool. */
  reshuffled: boolean;
};

export function cardKey(deckId: string, cardId: string): string {
  return `${deckId}/${cardId}`;
}

export function poolCardKey(card: PoolCard): string {
  return cardKey(card.deckId, card.cardId);
}

export const emptyDrawerState: DrawerState = { seen: [], reshuffleCount: 0 };

/**
 * Builds the draw order for a set of decks.
 *
 * With shuffleAcrossDecks the whole pool is shuffled together. Without it,
 * decks keep their turn: all of deck one, then all of deck two, each shuffled
 * within itself. Groups who pick three decks usually mean "play these three",
 * not "blend them", and interleaving makes the card colours flicker.
 */
export function buildPool(
  decks: readonly { id: string; accentColor: string; cards: readonly { id: string; text: string; note: string | null }[] }[],
  options: { shuffleAcrossDecks: boolean; random: Random },
): PoolCard[] {
  const byDeck = decks.map((deck) =>
    deck.cards.map(
      (card): PoolCard => ({
        deckId: deck.id,
        cardId: card.id,
        text: card.text,
        note: card.note,
        accentColor: deck.accentColor,
      }),
    ),
  );

  if (options.shuffleAcrossDecks) {
    return shuffle(byDeck.flat(), options.random);
  }

  return byDeck.flatMap((cards) => shuffle(cards, options.random));
}

/**
 * Draws the next unseen card.
 *
 * Returns null only when the pool itself is empty — an exhausted pool recycles
 * rather than running out, because a round in progress must always have a next
 * card to show.
 */
export function drawNext(pool: readonly PoolCard[], state: DrawerState): Draw | null {
  if (pool.length === 0) return null;

  const seen = new Set(state.seen);
  const next = pool.find((card) => !seen.has(poolCardKey(card)));

  if (next) {
    return {
      card: next,
      state: { seen: [...state.seen, poolCardKey(next)], reshuffleCount: state.reshuffleCount },
      reshuffled: false,
    };
  }

  // Pool exhausted. Clear the seen set and start again from the top.
  const recycled = pool[0]!;
  return {
    card: recycled,
    state: { seen: [poolCardKey(recycled)], reshuffleCount: state.reshuffleCount + 1 },
    reshuffled: true,
  };
}

/** How many cards remain before the pool recycles. */
export function remainingInPool(pool: readonly PoolCard[], state: DrawerState): number {
  const seen = new Set(state.seen);
  return pool.reduce((count, card) => (seen.has(poolCardKey(card)) ? count : count + 1), 0);
}

/** Convenience for a single round with no session around it. */
export function createPool(
  decks: readonly { id: string; accentColor: string; cards: readonly { id: string; text: string; note: string | null }[] }[],
  options: { shuffleAcrossDecks?: boolean; seed: number },
): PoolCard[] {
  return buildPool(decks, {
    shuffleAcrossDecks: options.shuffleAcrossDecks ?? true,
    random: seededRandom(options.seed),
  });
}
