import {
  beginRound,
  completeRound,
  completedRounds,
  completeSession,
  createSession,
  discardUnfinishedRound,
  hasUnfinishedRound,
  isResumable,
  rematch,
  sessionWinState,
  whoseTurn,
} from './session';
import { standings } from './scoring';
import { makeJustPlayTeam, makeTeams } from './teams';
import { defaultSettings, type RoundResult, type Session } from './types';

const T0 = '2026-07-26T18:00:00Z';
const T1 = '2026-07-26T18:01:00Z';

function results(spec: string): RoundResult[] {
  return [...spec].map((ch, i) => ({
    cardId: `dck_1/crd_${i}`,
    outcome: ch === 'c' ? 'correct' : 'pass',
    atMs: i * 1_000,
  }));
}

function newSession(overrides: Partial<Session> = {}): Session {
  return {
    ...createSession({
      id: 'ses_1',
      deckIds: ['dck_1'],
      teams: makeTeams(2),
      settings: defaultSettings,
      now: T0,
    }),
    ...overrides,
  };
}

/** Plays one full round for whoever is up. */
function playRound(session: Session, spec: string, seen: string[] = []): Session {
  const started = beginRound(session, `rnd_${session.rounds.length + 1}`, T0);
  return completeRound(started, {
    results: results(spec),
    seenCardIds: [...session.seenCardIds, ...seen],
    now: T1,
  });
}

describe('creating a session', () => {
  it('starts empty and open', () => {
    const session = newSession();
    expect(session.rounds).toEqual([]);
    expect(session.seenCardIds).toEqual([]);
    expect(session.completedAt).toBeNull();
    expect(isResumable(session)).toBe(true);
  });
});

describe('rotation', () => {
  it('cycles through teams in order', () => {
    let session = newSession();
    expect(whoseTurn(session)?.team.name).toBe('Reds');

    session = playRound(session, 'c');
    expect(whoseTurn(session)?.team.name).toBe('Blues');

    session = playRound(session, 'c');
    expect(whoseTurn(session)?.team.name).toBe('Reds');
  });

  it('rotates the player within a team', () => {
    let session = newSession({ teams: [makeJustPlayTeam(['Sam', 'Alex', 'Jo'])] });

    expect(whoseTurn(session)?.playerName).toBe('Sam');
    session = playRound(session, 'c');
    expect(whoseTurn(session)?.playerName).toBe('Alex');
    session = playRound(session, 'c');
    expect(whoseTurn(session)?.playerName).toBe('Jo');
    session = playRound(session, 'c');
    expect(whoseTurn(session)?.playerName).toBe('Sam');
  });

  it('rotates each team independently', () => {
    const teams = [
      makeJustPlayTeam(['Sam', 'Alex']),
      { ...makeTeams(2)[1]!, playerNames: ['Kim', 'Lee'] },
    ];
    let session = newSession({ teams });

    expect(whoseTurn(session)?.playerName).toBe('Sam');
    session = playRound(session, 'c');
    expect(whoseTurn(session)?.playerName).toBe('Kim');
    session = playRound(session, 'c');
    expect(whoseTurn(session)?.playerName).toBe('Alex');
    session = playRound(session, 'c');
    expect(whoseTurn(session)?.playerName).toBe('Lee');
  });

  it('has no player name for a team that gave none', () => {
    expect(whoseTurn(newSession())?.playerName).toBeNull();
  });

  it('is null with no teams', () => {
    expect(whoseTurn(newSession({ teams: [] }))).toBeNull();
  });

  /** Derived from the round list rather than stored, so it cannot drift. */
  it('survives a session rebuilt from its rounds', () => {
    let session = newSession();
    session = playRound(session, 'c');

    const rebuilt: Session = { ...session };
    expect(whoseTurn(rebuilt)?.team.id).toBe(whoseTurn(session)?.team.id);
  });
});

describe('playing rounds', () => {
  it('records results against the team that played', () => {
    const session = playRound(newSession(), 'ccp');
    expect(session.rounds[0]?.teamId).toBe('tm_1');
    expect(session.rounds[0]?.results).toHaveLength(3);
    expect(session.rounds[0]?.endedAt).toBe(T1);
  });

  it('accumulates seen cards across rounds', () => {
    let session = playRound(newSession(), 'c', ['dck_1/crd_0']);
    session = playRound(session, 'c', ['dck_1/crd_1']);

    expect(session.seenCardIds).toEqual(['dck_1/crd_0', 'dck_1/crd_1']);
  });

  it('feeds standings that accumulate', () => {
    let session = playRound(newSession(), 'ccc');
    session = playRound(session, 'c');
    session = playRound(session, 'cc');

    expect(standings(session).map((s) => [s.teamName, s.score])).toEqual([
      ['Reds', 5],
      ['Blues', 1],
    ]);
  });

  it('ignores a completion when no round is open', () => {
    const session = newSession();
    expect(completeRound(session, { results: results('c'), seenCardIds: [], now: T1 })).toBe(
      session,
    );
  });

  it('completes only the round that is open', () => {
    let session = playRound(newSession(), 'ccc');
    session = beginRound(session, 'rnd_2', T0);
    session = completeRound(session, { results: results('p'), seenCardIds: [], now: T1 });

    expect(session.rounds[0]?.results).toHaveLength(3);
    expect(session.rounds[1]?.results).toHaveLength(1);
  });
});

describe('an interrupted round', () => {
  it('is visible as unfinished', () => {
    const session = beginRound(newSession(), 'rnd_1', T0);
    expect(hasUnfinishedRound(session)).toBe(true);
    expect(completedRounds(session)).toEqual([]);
  });

  /**
   * Not scored. The team takes its turn again rather than being credited with
   * a partial round nobody chose to end.
   */
  it('is dropped on resume, and the same team is up again', () => {
    let session = playRound(newSession(), 'ccc');
    expect(whoseTurn(session)?.team.name).toBe('Blues');

    session = beginRound(session, 'rnd_2', T0);
    session = discardUnfinishedRound(session);

    expect(session.rounds).toHaveLength(1);
    expect(whoseTurn(session)?.team.name).toBe('Blues');
  });

  it('leaves a session with no unfinished round untouched', () => {
    const session = playRound(newSession(), 'c');
    expect(discardUnfinishedRound(session)).toBe(session);
  });

  it('cannot end the session before its results are in', () => {
    const byRounds = newSession({
      settings: { ...defaultSettings, winCondition: { kind: 'rounds', count: 1 } },
    });

    let session = playRound(byRounds, 'c');
    session = playRound(session, 'c');
    expect(sessionWinState(session).over).toBe(true);

    const midRound = beginRound(newSession(), 'rnd_1', T0);
    expect(sessionWinState(midRound).over).toBe(false);
  });
});

describe('finishing', () => {
  it('stamps the completion time once', () => {
    const session = completeSession(newSession(), T1);
    expect(session.completedAt).toBe(T1);
    expect(completeSession(session, '2030-01-01T00:00:00Z').completedAt).toBe(T1);
  });

  it('is no longer resumable', () => {
    expect(isResumable(completeSession(newSession(), T1))).toBe(false);
  });
});

describe('rematch', () => {
  it('keeps the decks, teams and settings', () => {
    const original = newSession({
      settings: { ...defaultSettings, roundSeconds: 90, passPenalty: 1 },
    });
    const next = rematch(original, 'ses_2', T1);

    expect(next.deckIds).toEqual(original.deckIds);
    expect(next.settings).toEqual(original.settings);
    expect(next.teams.map((t) => t.name)).toEqual(original.teams.map((t) => t.name));
  });

  it('starts with no rounds, no score and no seen cards', () => {
    let original = playRound(newSession(), 'ccc', ['dck_1/crd_0']);
    original = completeSession(original, T1);

    const next = rematch(original, 'ses_2', T1);
    expect(next.rounds).toEqual([]);
    expect(next.seenCardIds).toEqual([]);
    expect(next.completedAt).toBeNull();
    expect(standings(next).every((s) => s.score === 0)).toBe(true);
  });

  /** So the same person is not put back on the forehead twice in a row. */
  it('carries the player rotation over', () => {
    let original = newSession({ teams: [makeJustPlayTeam(['Sam', 'Alex'])] });
    original = playRound(original, 'c');
    expect(whoseTurn(original)?.playerName).toBe('Alex');

    const next = rematch(original, 'ses_2', T1);
    expect(whoseTurn(next)?.playerName).toBe('Alex');
  });

  it('does not mutate the original', () => {
    const original = playRound(newSession(), 'ccc');
    rematch(original, 'ses_2', T1);
    expect(original.rounds).toHaveLength(1);
  });
});

describe('win conditions across a whole session', () => {
  it('ends a rounds session once every team has had its turns', () => {
    const twoRounds = newSession({
      settings: { ...defaultSettings, winCondition: { kind: 'rounds', count: 2 } },
    });

    let session = twoRounds;
    for (const spec of ['ccc', 'c', 'c']) session = playRound(session, spec);
    expect(sessionWinState(session).over).toBe(false);

    session = playRound(session, 'c');
    const state = sessionWinState(session);
    expect(state.over).toBe(true);
    expect(state.over && state.winners.map((w) => w.teamName)).toEqual(['Reds']);
  });

  it('ends a score session once the target is reached and the round is even', () => {
    const toFive = newSession({
      settings: { ...defaultSettings, winCondition: { kind: 'score', target: 5 } },
    });

    let session = playRound(toFive, 'ccccc');
    expect(sessionWinState(session).over).toBe(false);

    session = playRound(session, 'c');
    expect(sessionWinState(session).over).toBe(true);
  });

  it('ends a deckExhausted session only when told the pool ran out', () => {
    const untilEmpty = newSession({
      settings: { ...defaultSettings, winCondition: { kind: 'deckExhausted' } },
    });

    let session = playRound(untilEmpty, 'c');
    session = playRound(session, 'c');

    expect(sessionWinState(session, false).over).toBe(false);
    expect(sessionWinState(session, true).over).toBe(true);
  });
});
