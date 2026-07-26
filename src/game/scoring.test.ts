import {
  countOutcomes,
  editRoundResult,
  evaluateWinCondition,
  nextUp,
  playerStandings,
  scoreRound,
  standings,
} from './scoring';
import { defaultSettings, type Round, type RoundResult, type Session, type Team } from './types';

function team(id: string, name: string, players: string[] = []): Team {
  return { id, name, color: '#FF3D6E', playerNames: players, nextPlayerIndex: 0 };
}

function results(spec: string): RoundResult[] {
  // 'ccp' reads as correct, correct, pass.
  return [...spec].map((ch, i) => ({
    cardId: `dck_1/crd_${i}`,
    outcome: ch === 'c' ? 'correct' : 'pass',
    atMs: i * 1_000,
  }));
}

function round(id: string, teamId: string, spec: string, playerName: string | null = null): Round {
  return {
    id,
    teamId,
    playerName,
    startedAt: '2026-07-26T18:00:00Z',
    endedAt: '2026-07-26T18:01:00Z',
    results: results(spec),
  };
}

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'ses_1',
    deckIds: ['dck_1'],
    settings: defaultSettings,
    teams: [team('t1', 'Reds'), team('t2', 'Blues')],
    rounds: [],
    seenCardIds: [],
    createdAt: '2026-07-26T18:00:00Z',
    completedAt: null,
    ...overrides,
  };
}

describe('scoring a round', () => {
  it('gives a point per correct answer', () => {
    expect(scoreRound(results('ccc'), 0)).toBe(3);
  });

  it('does not penalise passes by default', () => {
    expect(scoreRound(results('ccppp'), 0)).toBe(2);
  });

  it('subtracts a point per pass when the penalty is on', () => {
    expect(scoreRound(results('ccppp'), 1)).toBe(-1);
  });

  it('scores an empty round as zero', () => {
    expect(scoreRound([], 1)).toBe(0);
  });

  it('counts outcomes', () => {
    expect(countOutcomes(results('ccpcp'))).toEqual({ correct: 3, passed: 2 });
  });
});

describe('standings', () => {
  it('accumulates across rounds', () => {
    const table = standings(
      session({
        rounds: [round('r1', 't1', 'ccc'), round('r2', 't2', 'cc'), round('r3', 't1', 'cc')],
      }),
    );

    expect(table.map((s) => [s.teamName, s.score])).toEqual([
      ['Reds', 5],
      ['Blues', 2],
    ]);
  });

  it('lists every team, including one that has not played', () => {
    const table = standings(session({ rounds: [round('r1', 't1', 'c')] }));
    expect(table).toHaveLength(2);
    expect(table.find((s) => s.teamName === 'Blues')?.roundsPlayed).toBe(0);
  });

  it('orders by score, highest first', () => {
    const table = standings(
      session({ rounds: [round('r1', 't1', 'c'), round('r2', 't2', 'ccc')] }),
    );
    expect(table[0]?.teamName).toBe('Blues');
  });

  it('breaks a tie on fewer passes', () => {
    const table = standings(
      session({ rounds: [round('r1', 't1', 'ccpp'), round('r2', 't2', 'cc')] }),
    );
    expect(table[0]?.teamName).toBe('Blues');
  });

  it('is stable for an exact tie rather than reshuffling between renders', () => {
    const s = session({ rounds: [round('r1', 't1', 'cc'), round('r2', 't2', 'cc')] });
    expect(standings(s).map((x) => x.teamId)).toEqual(standings(s).map((x) => x.teamId));
    expect(standings(s)[0]?.teamId).toBe('t1');
  });

  it('honours the pass penalty', () => {
    const withPenalty = session({
      settings: { ...defaultSettings, passPenalty: 1 },
      rounds: [round('r1', 't1', 'cppp')],
    });
    // Reds go negative, so a team that has not played yet is top of the table.
    expect(standings(withPenalty).find((s) => s.teamName === 'Reds')?.score).toBe(-2);
    expect(standings(withPenalty)[0]?.teamName).toBe('Blues');
  });

  it('ignores a round belonging to a team that no longer exists', () => {
    const table = standings(session({ rounds: [round('r1', 'gone', 'ccc')] }));
    expect(table.every((s) => s.score === 0)).toBe(true);
  });

  it('is empty when there are no teams', () => {
    expect(standings(session({ teams: [] }))).toEqual([]);
  });
});

describe('per-player standings', () => {
  it('tracks a cumulative score per player, which is what just-play mode needs', () => {
    const table = playerStandings(
      session({
        teams: [team('t1', 'Everyone', ['Sam', 'Alex'])],
        rounds: [
          round('r1', 't1', 'ccc', 'Sam'),
          round('r2', 't1', 'c', 'Alex'),
          round('r3', 't1', 'cc', 'Sam'),
        ],
      }),
    );

    expect(table.map((p) => [p.playerName, p.score, p.roundsPlayed])).toEqual([
      ['Sam', 5, 2],
      ['Alex', 1, 1],
    ]);
  });

  it('skips rounds with no player name', () => {
    expect(playerStandings(session({ rounds: [round('r1', 't1', 'ccc')] }))).toEqual([]);
  });

  it('keeps players on different teams apart even with the same name', () => {
    const table = playerStandings(
      session({
        rounds: [round('r1', 't1', 'ccc', 'Sam'), round('r2', 't2', 'c', 'Sam')],
      }),
    );
    expect(table).toHaveLength(2);
  });
});

describe('win conditions', () => {
  describe('by rounds', () => {
    const byRounds = (rounds: Round[]) =>
      evaluateWinCondition(
        session({ settings: { ...defaultSettings, winCondition: { kind: 'rounds', count: 2 } }, rounds }),
      );

    it('is not over before every team has played its rounds', () => {
      expect(byRounds([round('r1', 't1', 'c'), round('r2', 't2', 'c'), round('r3', 't1', 'c')]).over).toBe(
        false,
      );
    });

    /** Otherwise whoever went first wins on having had an extra turn. */
    it('waits for the last team to take its turn', () => {
      const result = byRounds([
        round('r1', 't1', 'ccc'),
        round('r2', 't2', 'c'),
        round('r3', 't1', 'c'),
        round('r4', 't2', 'c'),
      ]);
      expect(result.over).toBe(true);
    });

    it('names the winner', () => {
      const result = byRounds([
        round('r1', 't1', 'ccc'),
        round('r2', 't2', 'c'),
        round('r3', 't1', 'c'),
        round('r4', 't2', 'c'),
      ]);
      expect(result.over && result.winners.map((w) => w.teamName)).toEqual(['Reds']);
    });

    it('reports a draw as a draw rather than inventing a tiebreak', () => {
      const result = byRounds([
        round('r1', 't1', 'cc'),
        round('r2', 't2', 'cc'),
        round('r3', 't1', 'c'),
        round('r4', 't2', 'c'),
      ]);
      expect(result.over && result.winners.map((w) => w.teamName)).toEqual(['Reds', 'Blues']);
    });
  });

  describe('by score', () => {
    const byScore = (rounds: Round[], target = 5) =>
      evaluateWinCondition(
        session({ settings: { ...defaultSettings, winCondition: { kind: 'score', target } }, rounds }),
      );

    it('is not over below the target', () => {
      expect(byScore([round('r1', 't1', 'ccc'), round('r2', 't2', 'c')]).over).toBe(false);
    });

    it('ends once a team reaches the target and the round is complete', () => {
      const result = byScore([round('r1', 't1', 'ccccc'), round('r2', 't2', 'c')]);
      expect(result.over).toBe(true);
      expect(result.over && result.winners[0]?.teamName).toBe('Reds');
    });

    /** Teams behind in the rotation get their turn to answer. */
    it('lets the round finish before declaring a winner', () => {
      expect(byScore([round('r1', 't1', 'ccccc')]).over).toBe(false);
    });

    it('handles overshooting the target', () => {
      expect(byScore([round('r1', 't1', 'cccccccc'), round('r2', 't2', 'c')]).over).toBe(true);
    });
  });

  describe('by deck exhaustion', () => {
    const byDeck = (exhausted: boolean) =>
      evaluateWinCondition(
        session({
          settings: { ...defaultSettings, winCondition: { kind: 'deckExhausted' } },
          rounds: [round('r1', 't1', 'ccc'), round('r2', 't2', 'c')],
        }),
        exhausted,
      );

    it('is not over while cards remain', () => {
      expect(byDeck(false).over).toBe(false);
    });

    it('ends when the pool is used up', () => {
      const result = byDeck(true);
      expect(result.over).toBe(true);
      expect(result.over && result.reason).toBe('deckExhausted');
    });
  });

  it('is not over with no teams', () => {
    expect(evaluateWinCondition(session({ teams: [] })).over).toBe(false);
  });
});

describe('recap edits', () => {
  /** The reason score is derived rather than stored. */
  it('recomputes standings after an override', () => {
    const before = session({ rounds: [round('r1', 't1', 'ccp')] });
    expect(standings(before)[0]?.score).toBe(2);

    const after = editRoundResult(before, 'r1', 'dck_1/crd_2', 'correct');
    expect(standings(after)[0]?.score).toBe(3);
  });

  it('can take a point away as well as add one', () => {
    const before = session({ rounds: [round('r1', 't1', 'ccc')] });
    const after = editRoundResult(before, 'r1', 'dck_1/crd_0', 'pass');
    expect(standings(after)[0]?.score).toBe(2);
  });

  it('does not mutate the original session', () => {
    const before = session({ rounds: [round('r1', 't1', 'ccp')] });
    editRoundResult(before, 'r1', 'dck_1/crd_2', 'correct');
    expect(before.rounds[0]?.results[2]?.outcome).toBe('pass');
  });

  it('leaves other rounds and other cards alone', () => {
    const before = session({ rounds: [round('r1', 't1', 'cc'), round('r2', 't2', 'pp')] });
    const after = editRoundResult(before, 'r1', 'dck_1/crd_0', 'pass');

    expect(after.rounds[0]?.results.map((r) => r.outcome)).toEqual(['pass', 'correct']);
    expect(after.rounds[1]?.results.map((r) => r.outcome)).toEqual(['pass', 'pass']);
  });

  it('is a no-op for an unknown round or card', () => {
    const before = session({ rounds: [round('r1', 't1', 'cc')] });
    expect(editRoundResult(before, 'nope', 'dck_1/crd_0', 'pass')).toEqual(before);
    expect(editRoundResult(before, 'r1', 'nope', 'pass')).toEqual(before);
  });

  it('survives being toggled repeatedly', () => {
    let s = session({ rounds: [round('r1', 't1', 'c')] });
    for (let i = 0; i < 10; i += 1) {
      s = editRoundResult(s, 'r1', 'dck_1/crd_0', i % 2 === 0 ? 'pass' : 'correct');
    }
    expect(standings(s)[0]?.score).toBe(1);
  });
});

describe('whose turn it is', () => {
  it('rotates through teams', () => {
    const s = session();
    expect(nextUp(s)?.team.name).toBe('Reds');
    expect(nextUp({ ...s, rounds: [round('r1', 't1', 'c')] })?.team.name).toBe('Blues');
    expect(
      nextUp({ ...s, rounds: [round('r1', 't1', 'c'), round('r2', 't2', 'c')] })?.team.name,
    ).toBe('Reds');
  });

  it('names the player holding the phone', () => {
    const s = session({ teams: [team('t1', 'Everyone', ['Sam', 'Alex'])] });
    expect(nextUp(s)?.playerName).toBe('Sam');
  });

  it('has no player name when the team did not give any', () => {
    expect(nextUp(session())?.playerName).toBeNull();
  });

  it('is null with no teams', () => {
    expect(nextUp(session({ teams: [] }))).toBeNull();
  });
});
