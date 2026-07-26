/**
 * Session and round types, following the spec's data model.
 *
 * Score is always derived from rounds, never stored. A recap edit changes a
 * RoundResult and the standings recompute — there is no score field that could
 * drift out of sync.
 */

export type WinCondition =
  | { kind: 'rounds'; count: number }
  | { kind: 'score'; target: number }
  | { kind: 'deckExhausted' };

export type Team = {
  id: string;
  name: string;
  color: string;
  playerNames: string[];
  /** Rotates who holds the phone. */
  nextPlayerIndex: number;
};

export type Outcome = 'correct' | 'pass';

export type RoundResult = {
  cardId: string;
  outcome: Outcome;
  /** Milliseconds elapsed into the round. */
  atMs: number;
};

export type Round = {
  id: string;
  teamId: string;
  playerName: string | null;
  startedAt: string;
  endedAt: string | null;
  results: RoundResult[];
};

export type SessionSettings = {
  /** 30 | 60 | 90, or custom 15-180. */
  roundSeconds: number;
  /** 0 or 1. Default 0. */
  passPenalty: number;
  inputMode: 'tap' | 'tilt';
  winCondition: WinCondition;
  shuffleAcrossDecks: boolean;
};

export type Session = {
  id: string;
  deckIds: string[];
  settings: SessionSettings;
  teams: Team[];
  rounds: Round[];
  /** Composite deckId/cardId keys. Grows across the whole session. */
  seenCardIds: string[];
  createdAt: string;
  completedAt: string | null;
};

export const ROUND_SECONDS_PRESETS = [30, 60, 90] as const;
export const MIN_ROUND_SECONDS = 15;
export const MAX_ROUND_SECONDS = 180;

/** When the "time is running out" haptic fires. */
export const WARNING_SECONDS = 10;

export const defaultSettings: SessionSettings = {
  roundSeconds: 60,
  passPenalty: 0,
  inputMode: 'tap',
  winCondition: { kind: 'rounds', count: 4 },
  shuffleAcrossDecks: true,
};

export function clampRoundSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return defaultSettings.roundSeconds;
  return Math.min(MAX_ROUND_SECONDS, Math.max(MIN_ROUND_SECONDS, Math.round(seconds)));
}
