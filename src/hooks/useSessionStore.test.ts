import { poolCardKey } from '@/game/cardDrawer';
import { standings } from '@/game/scoring';
import { beginRound as pureBeginRound, sessionWinState, whoseTurn } from '@/game/session';
import { makeJustPlayTeam, makeTeams } from '@/game/teams';
import { defaultSettings, type SessionSettings } from '@/game/types';
import { migrate } from '@/storage/migrations';
import { getResumableSession, getSession } from '@/storage/sessionRepo';
import { createTestDriver, type TestDriver } from '@/storage/testDriver';
import { useSessionStore } from './useSessionStore';

/**
 * The store is a shell over pure logic, so this covers the wiring: that a
 * multi-round game can be played through it, that rounds land on disk, and
 * that resuming picks up where it left off.
 *
 * The test driver stands in for expo-sqlite. It satisfies the same Sql
 * interface the repository is written against.
 */

const decks = [
  {
    id: 'dck_1',
    name: 'Test',
    accentColor: '#FF3D6E',
    cards: Array.from({ length: 40 }, (_, i) => ({
      id: `crd_${i}`,
      text: `Card ${i}`,
      note: null,
    })),
  },
];

const store = () => useSessionStore.getState();

/**
 * The store takes a SQLiteDatabase; the test driver satisfies the same Sql
 * interface the repository is written against, which is all these paths touch.
 */
let db: TestDriver;
const asDb = () => db as unknown as Parameters<ReturnType<typeof store>['commitRound']>[0];

function start(settings: Partial<SessionSettings> = {}, teams = makeTeams(2)) {
  return store().startSession({
    id: 'ses_1',
    decks,
    teams,
    settings: { ...defaultSettings, ...settings },
    now: '2026-07-26T18:00:00Z',
    seed: 7,
  });
}

/** Plays one complete round through the store. */
async function playRound(correct: number, passed = 0) {
  store().beginRound(`rnd_${store().session!.rounds.length + 1}`, '2026-07-26T18:00:00Z');
  store().start(0);

  for (let i = 0; i < correct; i += 1) store().resolve('correct', (i + 1) * 100);
  for (let i = 0; i < passed; i += 1) store().resolve('pass', (correct + i + 1) * 100);

  store().endRound(10_000);
  await store().commitRound(asDb(), '2026-07-26T18:01:00Z');
}

beforeEach(async () => {
  db = createTestDriver();
  await migrate(db);
  store().reset();
});

afterEach(() => db.close());

describe('starting a session', () => {
  it('creates a session with the chosen teams and settings', () => {
    const session = start({ roundSeconds: 90 });

    expect(session.teams).toHaveLength(2);
    expect(session.settings.roundSeconds).toBe(90);
    expect(store().pool).toHaveLength(40);
    expect(store().deckNames).toEqual(['Test']);
  });

  it('starts with no rounds and nothing seen', () => {
    const session = start();
    expect(session.rounds).toEqual([]);
    expect(session.seenCardIds).toEqual([]);
  });
});

describe('playing a multi-round game', () => {
  it('accumulates score across rounds and teams', async () => {
    start();

    await playRound(3);
    await playRound(1);
    await playRound(2);

    expect(standings(store().session!).map((s) => [s.teamName, s.score])).toEqual([
      ['Reds', 5],
      ['Blues', 1],
    ]);
  });

  it('rotates teams between rounds', async () => {
    start();

    expect(whoseTurn(store().session!)?.team.name).toBe('Reds');
    await playRound(1);
    expect(whoseTurn(store().session!)?.team.name).toBe('Blues');
    await playRound(1);
    expect(whoseTurn(store().session!)?.team.name).toBe('Reds');
  });

  it('rotates players in just-play mode', async () => {
    start({}, [makeJustPlayTeam(['Sam', 'Alex'])]);

    expect(whoseTurn(store().session!)?.playerName).toBe('Sam');
    await playRound(2);
    expect(whoseTurn(store().session!)?.playerName).toBe('Alex');
    await playRound(1);
    expect(whoseTurn(store().session!)?.playerName).toBe('Sam');
  });

  /** No repeats across the whole session, not just within one round. */
  it('never repeats a card across rounds', async () => {
    start();

    await playRound(6);
    await playRound(6);
    await playRound(6);

    const all = store().session!.rounds.flatMap((r) => r.results.map((x) => x.cardId));
    expect(all).toHaveLength(18);
    expect(new Set(all).size).toBe(18);
  });

  it('carries seen cards into the next round', async () => {
    start();
    await playRound(5);

    expect(store().session!.seenCardIds).toHaveLength(6); // five resolved plus the one on screen

    store().beginRound('rnd_2', '2026-07-26T18:02:00Z');
    store().start(0);

    const onScreen = store().roundState.card!;
    expect(store().session!.seenCardIds).not.toContain(poolCardKey(onScreen));
  });
});

describe('persistence', () => {
  it('writes the session on every round completion', async () => {
    start();
    await playRound(3);

    const stored = await getSession(db, 'ses_1');
    expect(stored?.rounds).toHaveLength(1);
    expect(stored?.rounds[0]?.results).toHaveLength(3);
  });

  it('persists recap overrides, because they are committed together', async () => {
    start();

    store().beginRound('rnd_1', '2026-07-26T18:00:00Z');
    store().start(0);

    const first = store().roundState.card!;
    store().resolve('pass', 100);
    store().overrideResult(poolCardKey(first), 'correct');

    store().endRound(10_000);
    await store().commitRound(asDb(), '2026-07-26T18:01:00Z');

    const stored = await getSession(db, 'ses_1');
    expect(stored?.rounds[0]?.results[0]?.outcome).toBe('correct');
  });

  it('marks the session complete so it stops being resumable', async () => {
    start({ winCondition: { kind: 'rounds', count: 1 } });

    await playRound(3);
    await playRound(1);

    await store().completeSession(asDb(), '2026-07-26T18:10:00Z');

    expect(await getResumableSession(db)).toBeNull();
    expect((await getSession(db, 'ses_1'))?.completedAt).toBe('2026-07-26T18:10:00Z');
  });
});

describe('resuming', () => {
  it('picks up the score and the rotation', async () => {
    start();
    await playRound(3);
    await playRound(1);

    const stored = (await getSession(db, 'ses_1'))!;
    store().reset();
    store().resumeSession(stored, decks, 7);

    expect(standings(store().session!).map((s) => s.score)).toEqual([3, 1]);
    expect(whoseTurn(store().session!)?.team.name).toBe('Reds');
  });

  it('does not redeal cards already seen', async () => {
    start();
    await playRound(8);

    const stored = (await getSession(db, 'ses_1'))!;
    store().reset();
    store().resumeSession(stored, decks, 7);

    store().beginRound('rnd_2', '2026-07-26T18:02:00Z');
    store().start(0);

    expect(stored.seenCardIds).not.toContain(poolCardKey(store().roundState.card!));
  });

  /**
   * An interrupted round is not scored. The team takes its turn again rather
   * than being credited with a partial round nobody chose to end.
   */
  it('drops a round that was open when the app died', async () => {
    start();
    await playRound(3);

    // Never committed, so it is only in the session in memory.
    const interrupted = pureBeginRound(store().session!, 'rnd_2', '2026-07-26T18:02:00Z');
    expect(interrupted.rounds).toHaveLength(2);

    store().reset();
    store().resumeSession(interrupted, decks, 7);

    expect(store().session!.rounds).toHaveLength(1);
    expect(whoseTurn(store().session!)?.team.name).toBe('Blues');
  });
});

describe('win conditions through the store', () => {
  it('ends a rounds game once every team has had its turns', async () => {
    start({ winCondition: { kind: 'rounds', count: 2 } });

    await playRound(3);
    await playRound(1);
    await playRound(1);
    expect(sessionWinState(store().session!).over).toBe(false);

    await playRound(1);
    const state = sessionWinState(store().session!);
    expect(state.over).toBe(true);
    expect(state.over && state.winners.map((w) => w.teamName)).toEqual(['Reds']);
  });

  it('ends a score game once the target is met and the round is even', async () => {
    start({ winCondition: { kind: 'score', target: 5 } });

    await playRound(5);
    expect(sessionWinState(store().session!).over).toBe(false);

    await playRound(1);
    expect(sessionWinState(store().session!).over).toBe(true);
  });

  it('applies the pass penalty to standings', async () => {
    start({ passPenalty: 1 });
    await playRound(1, 3);

    expect(standings(store().session!).find((s) => s.teamName === 'Reds')?.score).toBe(-2);
  });
});

describe('reset', () => {
  it('clears everything so the next game starts clean', async () => {
    start();
    await playRound(2);

    store().reset();

    expect(store().session).toBeNull();
    expect(store().pool).toEqual([]);
    expect(store().deckNames).toEqual([]);
  });
});
