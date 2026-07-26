import type { Outcome, Round, RoundResult, Session, SessionSettings, Team, WinCondition } from '@/game/types';
import { clampRoundSeconds } from '@/game/types';

/**
 * Session parsing.
 *
 * A session goes to disk as JSON and comes back as unknown. This proves the
 * shape rather than casting, so a document written by a newer build, hand-
 * edited, or truncated by a crash fails cleanly instead of surfacing as a
 * missing property three screens later.
 *
 * Unlike deck import this produces no messages: the user never sees a session
 * document, so the only useful outcome is "usable" or "not".
 */

export type SessionSummary = {
  id: string;
  createdAt: string;
  completedAt: string | null;
  teamNames: string[];
  roundCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseOutcome(value: unknown): Outcome | null {
  return value === 'correct' || value === 'pass' ? value : null;
}

function parseWinCondition(value: unknown): WinCondition | null {
  if (!isRecord(value)) return null;

  switch (value.kind) {
    case 'rounds':
      return isFiniteNumber(value.count) && value.count > 0
        ? { kind: 'rounds', count: Math.round(value.count) }
        : null;
    case 'score':
      return isFiniteNumber(value.target) && value.target > 0
        ? { kind: 'score', target: Math.round(value.target) }
        : null;
    case 'deckExhausted':
      return { kind: 'deckExhausted' };
    default:
      return null;
  }
}

function parseSettings(value: unknown): SessionSettings | null {
  if (!isRecord(value)) return null;

  const winCondition = parseWinCondition(value.winCondition);
  if (!winCondition) return null;

  const inputMode = value.inputMode === 'tilt' ? 'tilt' : 'tap';

  return {
    roundSeconds: clampRoundSeconds(isFiniteNumber(value.roundSeconds) ? value.roundSeconds : 60),
    // Only 0 and 1 are meaningful, per the spec.
    passPenalty: value.passPenalty === 1 ? 1 : 0,
    inputMode,
    winCondition,
    shuffleAcrossDecks: value.shuffleAcrossDecks !== false,
  };
}

function parseTeam(value: unknown): Team | null {
  if (!isRecord(value)) return null;
  if (!isString(value.id) || !value.id) return null;
  if (!isString(value.name) || !value.name) return null;
  if (!isString(value.color)) return null;

  const playerNames = Array.isArray(value.playerNames)
    ? value.playerNames.filter(isString)
    : [];

  const nextPlayerIndex = isFiniteNumber(value.nextPlayerIndex)
    ? Math.max(0, Math.round(value.nextPlayerIndex))
    : 0;

  return { id: value.id, name: value.name, color: value.color, playerNames, nextPlayerIndex };
}

function parseResult(value: unknown): RoundResult | null {
  if (!isRecord(value)) return null;
  if (!isString(value.cardId) || !value.cardId) return null;

  const outcome = parseOutcome(value.outcome);
  if (!outcome) return null;

  return {
    cardId: value.cardId,
    outcome,
    atMs: isFiniteNumber(value.atMs) ? Math.max(0, value.atMs) : 0,
  };
}

function parseRound(value: unknown): Round | null {
  if (!isRecord(value)) return null;
  if (!isString(value.id) || !value.id) return null;
  if (!isString(value.teamId) || !value.teamId) return null;
  if (!isString(value.startedAt)) return null;

  if (!Array.isArray(value.results)) return null;
  const results = value.results.map(parseResult);
  // One bad result would silently change a score, so the round is rejected
  // rather than partially recovered.
  if (results.some((r) => r === null)) return null;

  return {
    id: value.id,
    teamId: value.teamId,
    playerName: isString(value.playerName) ? value.playerName : null,
    startedAt: value.startedAt,
    endedAt: isString(value.endedAt) ? value.endedAt : null,
    results: results as RoundResult[],
  };
}

/** Returns null for anything this build cannot use as a session. */
export function parseSession(raw: string): Session | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (!isString(value.id) || !value.id) return null;
  if (!isString(value.createdAt)) return null;

  const settings = parseSettings(value.settings);
  if (!settings) return null;

  if (!Array.isArray(value.teams)) return null;
  const teams = value.teams.map(parseTeam);
  if (teams.some((t) => t === null)) return null;

  if (!Array.isArray(value.rounds)) return null;
  const rounds = value.rounds.map(parseRound);
  if (rounds.some((r) => r === null)) return null;

  return {
    id: value.id,
    deckIds: Array.isArray(value.deckIds) ? value.deckIds.filter(isString) : [],
    settings,
    teams: teams as Team[],
    rounds: rounds as Round[],
    seenCardIds: Array.isArray(value.seenCardIds) ? value.seenCardIds.filter(isString) : [],
    createdAt: value.createdAt,
    completedAt: isString(value.completedAt) ? value.completedAt : null,
  };
}
