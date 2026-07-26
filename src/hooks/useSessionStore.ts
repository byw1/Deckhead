import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';
import { createPool, type PoolCard } from '@/game/cardDrawer';
import * as round from '@/game/round';
import type { RoundState } from '@/game/round';
import * as session from '@/game/session';
import type { Outcome, RoundResult, Session, SessionSettings, Team } from '@/game/types';
import { saveSession } from '@/storage/sessionRepo';

/**
 * The live game.
 *
 * A thin shell over the pure logic in /src/game. All the rules live there; this
 * holds the current values, owns the card pool, and decides when to write to
 * disk.
 *
 * Persistence happens at round completion rather than continuously. An
 * interrupted round is not scored, and the cards it showed were never folded
 * into seenCardIds, so they return to the pool with no rollback needed.
 */

export type PlayableDeck = {
  id: string;
  name: string;
  accentColor: string;
  cards: readonly { id: string; text: string; note: string | null }[];
};

export type SessionStore = {
  session: Session | null;
  pool: PoolCard[];
  roundState: RoundState;
  deckNames: string[];
  /** Set once the pool has been used up, for the deckExhausted win condition. */
  poolExhausted: boolean;

  startSession(input: {
    id: string;
    decks: readonly PlayableDeck[];
    teams: Team[];
    settings: SessionSettings;
    now: string;
    seed: number;
  }): Session;

  /** Rehydrates a stored session. Decks are reloaded and the pool rebuilt. */
  resumeSession(stored: Session, decks: readonly PlayableDeck[], seed: number): void;

  beginRound(roundId: string, nowIso: string): void;
  start(now: number): void;
  resolve(outcome: Outcome, now: number): void;
  pauseRound(now: number): void;
  resumeRound(now: number): void;
  endRound(now: number): void;
  tick(now: number): void;
  overrideResult(cardId: string, outcome: Outcome): void;

  /** Folds the round into the session and writes it. */
  commitRound(db: SQLiteDatabase, nowIso: string): Promise<Session | null>;
  completeSession(db: SQLiteDatabase, nowIso: string): Promise<void>;

  reset(): void;
};

const emptyRound: RoundState = round.createRound(60_000, { seen: [], reshuffleCount: 0 });

function poolFor(decks: readonly PlayableDeck[], settings: SessionSettings, seed: number) {
  return createPool(decks, { seed, shuffleAcrossDecks: settings.shuffleAcrossDecks });
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  pool: [],
  roundState: emptyRound,
  deckNames: [],
  poolExhausted: false,

  startSession(input) {
    const created = session.createSession({
      id: input.id,
      deckIds: input.decks.map((d) => d.id),
      teams: input.teams,
      settings: input.settings,
      now: input.now,
    });

    set({
      session: created,
      pool: poolFor(input.decks, input.settings, input.seed),
      roundState: round.createRound(input.settings.roundSeconds * 1_000, {
        seen: [],
        reshuffleCount: 0,
      }),
      deckNames: input.decks.map((d) => d.name),
      poolExhausted: false,
    });

    return created;
  },

  resumeSession(stored, decks, seed) {
    // Any round that was open when the app died is dropped, so the team whose
    // turn was interrupted takes it again from the top.
    const clean = session.discardUnfinishedRound(stored);

    set({
      session: clean,
      pool: poolFor(decks, clean.settings, seed),
      roundState: round.createRound(clean.settings.roundSeconds * 1_000, {
        seen: clean.seenCardIds,
        reshuffleCount: 0,
      }),
      deckNames: decks.map((d) => d.name),
      poolExhausted: false,
    });
  },

  beginRound(roundId, nowIso) {
    const current = get().session;
    if (!current) return;

    set({
      session: session.beginRound(current, roundId, nowIso),
      roundState: round.createRound(current.settings.roundSeconds * 1_000, {
        seen: current.seenCardIds,
        reshuffleCount: 0,
      }),
    });
  },

  start(now) {
    set({ roundState: round.start(get().roundState, get().pool, now) });
  },

  resolve(outcome, now) {
    const next = round.resolveCard(get().roundState, get().pool, outcome, now);
    set({ roundState: next, poolExhausted: get().poolExhausted || next.reshuffled });
  },

  pauseRound(now) {
    set({ roundState: round.pause(get().roundState, now) });
  },

  resumeRound(now) {
    set({ roundState: round.resume(get().roundState, now) });
  },

  endRound(now) {
    set({ roundState: round.end(get().roundState, now) });
  },

  tick(now) {
    const next = round.tick(get().roundState, now);
    if (next !== get().roundState) set({ roundState: next });
  },

  overrideResult(cardId, outcome) {
    set((current) => ({
      roundState: {
        ...current.roundState,
        results: current.roundState.results.map(
          (result): RoundResult => (result.cardId === cardId ? { ...result, outcome } : result),
        ),
      },
    }));
  },

  async commitRound(db, nowIso) {
    const { session: current, roundState } = get();
    if (!current) return null;

    const committed = session.completeRound(current, {
      results: roundState.results,
      seenCardIds: [...roundState.drawer.seen],
      now: nowIso,
    });

    set({ session: committed });
    await saveSession(db, committed);
    return committed;
  },

  async completeSession(db, nowIso) {
    const current = get().session;
    if (!current) return;

    const done = session.completeSession(current, nowIso);
    set({ session: done });
    await saveSession(db, done);
  },

  reset() {
    set({
      session: null,
      pool: [],
      roundState: emptyRound,
      deckNames: [],
      poolExhausted: false,
    });
  },
}));

/** Looks a card up by its composite key, for the recap. */
export function findPoolCard(pool: readonly PoolCard[], cardId: string): PoolCard | undefined {
  return pool.find((card) => `${card.deckId}/${card.cardId}` === cardId);
}
