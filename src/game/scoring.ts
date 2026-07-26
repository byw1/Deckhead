import type { Round, RoundResult, Session, Team, WinCondition } from './types';

/**
 * Score derivation.
 *
 * Score is never stored. Every standing here is computed from rounds, so a
 * recap edit changes a RoundResult and the standings recompute with no separate
 * field to drift out of sync.
 */

export type Standing = {
  teamId: string;
  teamName: string;
  teamColor: string;
  correct: number;
  passed: number;
  score: number;
  roundsPlayed: number;
};

export type PlayerStanding = {
  playerName: string;
  teamId: string;
  correct: number;
  passed: number;
  score: number;
  roundsPlayed: number;
};

/** Score for one round. Passes only cost anything when a penalty is set. */
export function scoreRound(results: readonly RoundResult[], passPenalty: number): number {
  return results.reduce(
    (total, result) => total + (result.outcome === 'correct' ? 1 : -passPenalty),
    0,
  );
}

export function countOutcomes(results: readonly RoundResult[]): { correct: number; passed: number } {
  let correct = 0;
  let passed = 0;
  for (const result of results) {
    if (result.outcome === 'correct') correct += 1;
    else passed += 1;
  }
  return { correct, passed };
}

/**
 * Cumulative standings, highest first.
 *
 * Ties break on fewest passes, then on team order, so the table is stable
 * rather than reshuffling between renders on an equal score.
 */
export function standings(session: Session): Standing[] {
  const byTeam = new Map<string, Standing>();

  session.teams.forEach((team) => {
    byTeam.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      teamColor: team.color,
      correct: 0,
      passed: 0,
      score: 0,
      roundsPlayed: 0,
    });
  });

  for (const round of session.rounds) {
    const standing = byTeam.get(round.teamId);
    if (!standing) continue;

    const { correct, passed } = countOutcomes(round.results);
    standing.correct += correct;
    standing.passed += passed;
    standing.score += scoreRound(round.results, session.settings.passPenalty);
    standing.roundsPlayed += 1;
  }

  const order = new Map(session.teams.map((team, index) => [team.id, index]));

  return [...byTeam.values()].sort(
    (a, b) =>
      b.score - a.score ||
      a.passed - b.passed ||
      (order.get(a.teamId) ?? 0) - (order.get(b.teamId) ?? 0),
  );
}

/**
 * Per-player standings.
 *
 * "Just play" mode is a single team, so this is what makes a cumulative score
 * per player possible without teams existing as a concept for the group.
 */
export function playerStandings(session: Session): PlayerStanding[] {
  const byPlayer = new Map<string, PlayerStanding>();

  for (const round of session.rounds) {
    if (!round.playerName) continue;

    const key = `${round.teamId}/${round.playerName}`;
    const existing = byPlayer.get(key) ?? {
      playerName: round.playerName,
      teamId: round.teamId,
      correct: 0,
      passed: 0,
      score: 0,
      roundsPlayed: 0,
    };

    const { correct, passed } = countOutcomes(round.results);
    existing.correct += correct;
    existing.passed += passed;
    existing.score += scoreRound(round.results, session.settings.passPenalty);
    existing.roundsPlayed += 1;

    byPlayer.set(key, existing);
  }

  return [...byPlayer.values()].sort(
    (a, b) => b.score - a.score || a.passed - b.passed || a.playerName.localeCompare(b.playerName),
  );
}

export type WinState =
  | { over: false }
  | { over: true; reason: WinCondition['kind']; winners: Standing[] };

/**
 * Evaluates whether the session is over.
 *
 * Winners is a list because a draw is a real outcome and pretending otherwise
 * would mean inventing a tiebreak the group did not agree to.
 */
export function evaluateWinCondition(session: Session, poolExhausted = false): WinState {
  const table = standings(session);
  if (table.length === 0) return { over: false };

  const condition = session.settings.winCondition;

  const finish = (reason: WinCondition['kind']): WinState => {
    const top = table[0]!.score;
    return { over: true, reason, winners: table.filter((s) => s.score === top) };
  };

  switch (condition.kind) {
    case 'rounds': {
      // Every team plays the same number of rounds, so the session ends only
      // once the last team has had its turn. Otherwise whoever went first wins
      // on having had an extra go.
      const fewest = Math.min(...table.map((s) => s.roundsPlayed));
      return fewest >= condition.count ? finish('rounds') : { over: false };
    }

    case 'score': {
      const reached = table.some((s) => s.score >= condition.target);
      if (!reached) return { over: false };

      // Let the round out so teams behind in the rotation get their turn.
      const counts = table.map((s) => s.roundsPlayed);
      const even = Math.max(...counts) === Math.min(...counts);
      return even ? finish('score') : { over: false };
    }

    case 'deckExhausted':
      return poolExhausted ? finish('deckExhausted') : { over: false };
  }
}

/** Applies a recap edit. Returns a new session; the original is untouched. */
export function editRoundResult(
  session: Session,
  roundId: string,
  cardId: string,
  outcome: RoundResult['outcome'],
): Session {
  return {
    ...session,
    rounds: session.rounds.map((round): Round => {
      if (round.id !== roundId) return round;
      return {
        ...round,
        results: round.results.map((result) =>
          result.cardId === cardId ? { ...result, outcome } : result,
        ),
      };
    }),
  };
}

/** Whose turn it is to hold the phone, and the team they play for. */
export function nextUp(session: Session): { team: Team; playerName: string | null } | null {
  if (session.teams.length === 0) return null;

  const teamIndex = session.rounds.length % session.teams.length;
  const team = session.teams[teamIndex]!;
  const playerName =
    team.playerNames.length > 0
      ? (team.playerNames[team.nextPlayerIndex % team.playerNames.length] ?? null)
      : null;

  return { team, playerName };
}
