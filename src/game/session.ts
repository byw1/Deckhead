import { cardKey } from './cardDrawer';
import { evaluateWinCondition, type WinState } from './scoring';
import type { Round, RoundResult, Session, SessionSettings, Team } from './types';

/**
 * Session lifecycle.
 *
 * A session is a sequence of rounds across a fixed set of teams. Everything
 * here is pure: given a session and what happened, return the next session.
 * Nothing writes to storage and nothing reads a clock it was not handed.
 */

export type NewSessionInput = {
  id: string;
  deckIds: string[];
  teams: Team[];
  settings: SessionSettings;
  now: string;
};

export function createSession(input: NewSessionInput): Session {
  return {
    id: input.id,
    deckIds: input.deckIds,
    settings: input.settings,
    teams: input.teams,
    rounds: [],
    seenCardIds: [],
    createdAt: input.now,
    completedAt: null,
  };
}

/**
 * The team and player whose turn it is.
 *
 * Rotation is derived from how many rounds have been played rather than stored
 * as a pointer, so it cannot drift out of step with the round list — the same
 * reason score is derived.
 */
export function whoseTurn(session: Session): { team: Team; playerName: string | null } | null {
  if (session.teams.length === 0) return null;

  const team = session.teams[session.rounds.length % session.teams.length]!;
  const playerName =
    team.playerNames.length > 0
      ? (team.playerNames[team.nextPlayerIndex % team.playerNames.length] ?? null)
      : null;

  return { team, playerName };
}

/** Appends a round for whoever is up. Not persisted until the round completes. */
export function beginRound(session: Session, roundId: string, now: string): Session {
  const turn = whoseTurn(session);
  if (!turn) return session;

  const round: Round = {
    id: roundId,
    teamId: turn.team.id,
    playerName: turn.playerName,
    startedAt: now,
    endedAt: null,
    results: [],
  };

  return { ...session, rounds: [...session.rounds, round] };
}

/**
 * Records the outcome of the round in progress.
 *
 * Advances the player rotation for the team that just played, and folds the
 * cards seen into the session so the next round does not repeat them. A reset
 * drawer state — which happens when the pool is exhausted and recycles —
 * replaces the seen list rather than extending it.
 */
export function completeRound(
  session: Session,
  input: { results: RoundResult[]; seenCardIds: string[]; now: string },
): Session {
  const index = session.rounds.findIndex((round) => round.endedAt === null);
  if (index === -1) return session;

  const round = session.rounds[index]!;

  const rounds = session.rounds.map((r, i) =>
    i === index ? { ...r, results: input.results, endedAt: input.now } : r,
  );

  const teams = session.teams.map((team) =>
    team.id === round.teamId && team.playerNames.length > 0
      ? { ...team, nextPlayerIndex: (team.nextPlayerIndex + 1) % team.playerNames.length }
      : team,
  );

  return { ...session, rounds, teams, seenCardIds: input.seenCardIds };
}

/**
 * Drops a round that was started but never finished.
 *
 * Used on resume. An interrupted round is not scored — the team takes its turn
 * again from the top rather than being credited with a partial round nobody
 * chose to end. The cards it showed were never folded into seenCardIds, so
 * they come back into the pool automatically.
 */
export function discardUnfinishedRound(session: Session): Session {
  if (!session.rounds.some((round) => round.endedAt === null)) return session;
  return { ...session, rounds: session.rounds.filter((round) => round.endedAt !== null) };
}

export function hasUnfinishedRound(session: Session): boolean {
  return session.rounds.some((round) => round.endedAt === null);
}

/** Rounds that count. A round in progress has no results worth reading yet. */
export function completedRounds(session: Session): Round[] {
  return session.rounds.filter((round) => round.endedAt !== null);
}

/**
 * Whether the session is over.
 *
 * Evaluated against completed rounds only, so a round in progress cannot end
 * the session before its results are in.
 */
export function sessionWinState(session: Session, poolExhausted = false): WinState {
  return evaluateWinCondition(
    { ...session, rounds: completedRounds(session) },
    poolExhausted,
  );
}

export function completeSession(session: Session, now: string): Session {
  return session.completedAt ? session : { ...session, completedAt: now };
}

/** True for a session that was started and is neither finished nor empty. */
export function isResumable(session: Session): boolean {
  return session.completedAt === null;
}

/**
 * A fresh session with the same teams, decks and settings.
 *
 * Player rotation carries over rather than resetting, so a rematch does not put
 * the same person back on the forehead twice in a row.
 */
export function rematch(session: Session, id: string, now: string): Session {
  return createSession({
    id,
    deckIds: session.deckIds,
    teams: session.teams,
    settings: session.settings,
    now,
  });
}

/** Turns drawer keys into the session's seen list. Composite deckId/cardId. */
export function toSeenCardIds(seen: readonly string[]): string[] {
  return [...seen];
}

export { cardKey };
