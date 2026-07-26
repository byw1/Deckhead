import { create } from 'zustand';
import { createPool, emptyDrawerState, type PoolCard } from '@/game/cardDrawer';
import * as round from '@/game/round';
import type { RoundState } from '@/game/round';
import type { Outcome, RoundResult } from '@/game/types';

/**
 * Round state for the screens.
 *
 * A thin shell over the pure state machine in round.ts. All the rules live
 * there; this only holds the current value and the pool, so the logic stays
 * testable without a renderer and the store stays trivial.
 */

export type PlayableDeck = {
  id: string;
  name: string;
  accentColor: string;
  cards: readonly { id: string; text: string; note: string | null }[];
};

export type RoundStore = {
  pool: PoolCard[];
  state: RoundState;
  /** Deck names, for the recap header. */
  deckNames: string[];

  prepare(decks: readonly PlayableDeck[], options: { roundSeconds: number; seed: number; shuffleAcrossDecks?: boolean }): void;
  begin(now: number): void;
  resolve(outcome: Outcome, now: number): void;
  pause(now: number): void;
  resume(now: number): void;
  finish(now: number): void;
  tick(now: number): void;
  /** Recap override. Score is derived, so flipping a result is the whole edit. */
  overrideResult(cardId: string, outcome: Outcome): void;
  reset(): void;
};

const emptyState: RoundState = round.createRound(60_000, emptyDrawerState);

export const useRoundStore = create<RoundStore>((set, get) => ({
  pool: [],
  state: emptyState,
  deckNames: [],

  prepare(decks, options) {
    set({
      pool: createPool(decks, {
        seed: options.seed,
        shuffleAcrossDecks: options.shuffleAcrossDecks ?? true,
      }),
      state: round.createRound(options.roundSeconds * 1_000, emptyDrawerState),
      deckNames: decks.map((d) => d.name),
    });
  },

  begin(now) {
    set({ state: round.start(get().state, get().pool, now) });
  },

  resolve(outcome, now) {
    set({ state: round.resolveCard(get().state, get().pool, outcome, now) });
  },

  pause(now) {
    set({ state: round.pause(get().state, now) });
  },

  resume(now) {
    set({ state: round.resume(get().state, now) });
  },

  finish(now) {
    set({ state: round.end(get().state, now) });
  },

  tick(now) {
    const next = round.tick(get().state, now);
    if (next !== get().state) set({ state: next });
  },

  overrideResult(cardId, outcome) {
    set((current) => ({
      state: {
        ...current.state,
        results: current.state.results.map(
          (result): RoundResult => (result.cardId === cardId ? { ...result, outcome } : result),
        ),
      },
    }));
  },

  reset() {
    set({ pool: [], state: emptyState, deckNames: [] });
  },
}));

/** Looks a card up by its composite key, for the recap. */
export function findPoolCard(pool: readonly PoolCard[], cardId: string): PoolCard | undefined {
  return pool.find((card) => `${card.deckId}/${card.cardId}` === cardId);
}
