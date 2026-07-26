import { drawNext, poolCardKey, type DrawerState, type PoolCard } from './cardDrawer';
import type { Outcome, RoundResult } from './types';

/**
 * The round, as a pure state machine.
 *
 * No timers live here. The caller supplies the current time on every
 * transition, which is what makes the whole thing testable and what lets
 * backgrounding be handled honestly: a paused round stops accumulating elapsed
 * time rather than pretending the clock did not move.
 */

export type RoundPhase = 'intro' | 'running' | 'paused' | 'ended';

export type RoundState = {
  phase: RoundPhase;
  /** Card currently on screen. Null before the round starts and after it ends. */
  card: PoolCard | null;
  results: RoundResult[];
  drawer: DrawerState;
  /** Total round length in milliseconds. */
  durationMs: number;
  /**
   * Milliseconds of running time already banked, excluding any currently
   * running stretch. Pausing adds to this; resuming starts a new stretch.
   */
  bankedMs: number;
  /** Timestamp the current running stretch began, or null when not running. */
  runningSince: number | null;
  /** Set when the pool recycled mid-round, so the recap can mention it. */
  reshuffled: boolean;
};

export function createRound(durationMs: number, drawer: DrawerState): RoundState {
  return {
    phase: 'intro',
    card: null,
    results: [],
    drawer,
    durationMs,
    bankedMs: 0,
    runningSince: null,
    reshuffled: false,
  };
}

/** Milliseconds elapsed into the round at the given moment. */
export function elapsedMs(state: RoundState, now: number): number {
  const running = state.runningSince === null ? 0 : Math.max(0, now - state.runningSince);
  return Math.min(state.durationMs, state.bankedMs + running);
}

export function remainingMs(state: RoundState, now: number): number {
  return Math.max(0, state.durationMs - elapsedMs(state, now));
}

export function isTimeUp(state: RoundState, now: number): boolean {
  return remainingMs(state, now) <= 0;
}

/** Starts the round and deals the first card. */
export function start(state: RoundState, pool: readonly PoolCard[], now: number): RoundState {
  if (state.phase !== 'intro') return state;

  const draw = drawNext(pool, state.drawer);
  if (!draw) return { ...state, phase: 'ended', runningSince: null };

  return {
    ...state,
    phase: 'running',
    card: draw.card,
    drawer: draw.state,
    reshuffled: state.reshuffled || draw.reshuffled,
    runningSince: now,
  };
}

/**
 * Records an outcome for the card on screen and deals the next one.
 *
 * Ignored unless the round is running, so a tap landing during the flash after
 * time-up cannot score a card the player never saw.
 */
export function resolveCard(
  state: RoundState,
  pool: readonly PoolCard[],
  outcome: Outcome,
  now: number,
): RoundState {
  if (state.phase !== 'running' || !state.card) return state;

  const at = elapsedMs(state, now);
  const result: RoundResult = { cardId: poolCardKey(state.card), outcome, atMs: at };
  const results = [...state.results, result];

  // The card counts even if the clock ran out while it was on screen — the
  // player saw it and answered. Ending is checked after recording, not before.
  if (at >= state.durationMs) {
    return { ...state, phase: 'ended', results, card: null, bankedMs: state.durationMs, runningSince: null };
  }

  const draw = drawNext(pool, state.drawer);
  if (!draw) {
    return { ...state, phase: 'ended', results, card: null, bankedMs: at, runningSince: null };
  }

  return {
    ...state,
    results,
    card: draw.card,
    drawer: draw.state,
    reshuffled: state.reshuffled || draw.reshuffled,
  };
}

/** Banks elapsed time and stops the clock. Used when the app backgrounds. */
export function pause(state: RoundState, now: number): RoundState {
  if (state.phase !== 'running') return state;
  return { ...state, phase: 'paused', bankedMs: elapsedMs(state, now), runningSince: null };
}

export function resume(state: RoundState, now: number): RoundState {
  if (state.phase !== 'paused') return state;
  if (state.bankedMs >= state.durationMs) return end(state);
  return { ...state, phase: 'running', runningSince: now };
}

/** Ends the round, whether the clock ran out or the player quit. */
export function end(state: RoundState, now?: number): RoundState {
  if (state.phase === 'ended') return state;
  const banked = now === undefined ? state.bankedMs : elapsedMs(state, now);
  return { ...state, phase: 'ended', card: null, bankedMs: banked, runningSince: null };
}

/** Advances the round to ended if the clock has run out. */
export function tick(state: RoundState, now: number): RoundState {
  if (state.phase !== 'running') return state;
  return isTimeUp(state, now) ? end(state, now) : state;
}
