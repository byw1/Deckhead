import { beginRound, completeRound, completeSession, createSession } from '@/game/session';
import { makeJustPlayTeam, makeTeams } from '@/game/teams';
import { defaultSettings, type Session } from '@/game/types';
import { migrate } from './migrations';
import {
  countSessions,
  deleteSession,
  discardOtherUnfinishedSessions,
  getResumableSession,
  getSession,
  listSessionSummaries,
  saveSession,
} from './sessionRepo';
import { parseSession } from './sessionSchema';
import { createTestDriver, type TestDriver } from './testDriver';

const T0 = '2026-07-26T18:00:00Z';
const T1 = '2026-07-26T18:05:00Z';

function newSession(id = 'ses_1', overrides: Partial<Session> = {}): Session {
  return {
    ...createSession({
      id,
      deckIds: ['dck_1'],
      teams: makeTeams(2),
      settings: defaultSettings,
      now: T0,
    }),
    ...overrides,
  };
}

function played(session: Session): Session {
  const started = beginRound(session, 'rnd_1', T0);
  return completeRound(started, {
    results: [
      { cardId: 'dck_1/crd_0', outcome: 'correct', atMs: 1_000 },
      { cardId: 'dck_1/crd_1', outcome: 'pass', atMs: 2_000 },
    ],
    seenCardIds: ['dck_1/crd_0', 'dck_1/crd_1'],
    now: T1,
  });
}

describe('session storage', () => {
  let db: TestDriver;

  beforeEach(async () => {
    db = createTestDriver();
    await migrate(db);
  });

  afterEach(() => db.close());

  describe('round trip', () => {
    it('returns a session exactly as it went in', async () => {
      const session = played(newSession());
      await saveSession(db, session);
      expect(await getSession(db, session.id)).toEqual(session);
    });

    it('preserves teams, players and rotation', async () => {
      const session = newSession('ses_1', {
        teams: [makeJustPlayTeam(['Sam', 'Alex'])],
      });
      await saveSession(db, session);

      const loaded = await getSession(db, session.id);
      expect(loaded?.teams[0]?.playerNames).toEqual(['Sam', 'Alex']);
      expect(loaded?.teams[0]?.nextPlayerIndex).toBe(0);
    });

    it('preserves every win condition shape', async () => {
      const conditions = [
        { kind: 'rounds', count: 4 },
        { kind: 'score', target: 20 },
        { kind: 'deckExhausted' },
      ] as const;

      for (const [i, winCondition] of conditions.entries()) {
        const session = newSession(`ses_${i}`, {
          settings: { ...defaultSettings, winCondition },
        });
        await saveSession(db, session);
        expect((await getSession(db, session.id))?.settings.winCondition).toEqual(winCondition);
      }
    });

    it('preserves round results, which is where the score comes from', async () => {
      const session = played(newSession());
      await saveSession(db, session);

      const loaded = await getSession(db, session.id);
      expect(loaded?.rounds[0]?.results).toEqual(session.rounds[0]?.results);
    });

    it('returns null for a session that is not there', async () => {
      expect(await getSession(db, 'ses_missing')).toBeNull();
    });

    it('survives team names that would break naive SQL', async () => {
      const teams = makeTeams(1);
      teams[0] = { ...teams[0]!, name: `Bobby'); DROP TABLE sessions;--` };
      const session = newSession('ses_1', { teams });

      await saveSession(db, session);
      expect((await getSession(db, session.id))?.teams[0]?.name).toBe(teams[0].name);
      expect(db.tableNames()).toContain('sessions');
    });
  });

  describe('saving', () => {
    it('updates in place rather than duplicating', async () => {
      const session = newSession();
      await saveSession(db, session);
      await saveSession(db, played(session));

      expect(await countSessions(db)).toBe(1);
      expect((await getSession(db, session.id))?.rounds).toHaveLength(1);
    });

    it('records completion', async () => {
      const session = completeSession(played(newSession()), T1);
      await saveSession(db, session);
      expect((await getSession(db, session.id))?.completedAt).toBe(T1);
    });
  });

  describe('resuming', () => {
    it('offers an unfinished session', async () => {
      const session = played(newSession());
      await saveSession(db, session);
      expect((await getResumableSession(db))?.id).toBe(session.id);
    });

    it('does not offer a finished one', async () => {
      await saveSession(db, completeSession(played(newSession()), T1));
      expect(await getResumableSession(db)).toBeNull();
    });

    it('offers the most recent when a crash left two', async () => {
      await saveSession(db, newSession('ses_old', { createdAt: '2026-07-01T10:00:00Z' }));
      await saveSession(db, newSession('ses_new', { createdAt: '2026-07-26T10:00:00Z' }));

      expect((await getResumableSession(db))?.id).toBe('ses_new');
    });

    /**
     * A resume that cannot work is worse than no resume, so an unreadable
     * session is dropped rather than offered.
     */
    it('discards an unreadable session instead of offering it', async () => {
      await saveSession(db, newSession());
      db.raw.prepare('UPDATE sessions SET data = ? WHERE id = ?').run('{not json', 'ses_1');

      expect(await getResumableSession(db)).toBeNull();
      expect(await countSessions(db)).toBe(0);
    });

    it('abandons other unfinished sessions when a new game starts', async () => {
      await saveSession(db, newSession('ses_old'));
      await saveSession(db, newSession('ses_new'));

      const removed = await discardOtherUnfinishedSessions(db, 'ses_new');
      expect(removed).toBe(1);
      expect((await getResumableSession(db))?.id).toBe('ses_new');
    });

    it('never discards a finished session', async () => {
      await saveSession(db, completeSession(played(newSession('ses_done')), T1));
      await saveSession(db, newSession('ses_new'));

      await discardOtherUnfinishedSessions(db, 'ses_new');
      expect(await getSession(db, 'ses_done')).not.toBeNull();
    });
  });

  describe('history', () => {
    it('lists newest first', async () => {
      await saveSession(db, newSession('ses_a', { createdAt: '2026-07-01T10:00:00Z' }));
      await saveSession(db, newSession('ses_b', { createdAt: '2026-07-26T10:00:00Z' }));

      expect((await listSessionSummaries(db)).map((s) => s.id)).toEqual(['ses_b', 'ses_a']);
    });

    it('summarises teams and completed rounds', async () => {
      await saveSession(db, played(newSession()));

      const [summary] = await listSessionSummaries(db);
      expect(summary?.teamNames).toEqual(['Reds', 'Blues']);
      expect(summary?.roundCount).toBe(1);
    });

    it('does not count a round still in progress', async () => {
      await saveSession(db, beginRound(newSession(), 'rnd_1', T0));
      expect((await listSessionSummaries(db))[0]?.roundCount).toBe(0);
    });

    it('skips unreadable rows rather than failing the whole list', async () => {
      await saveSession(db, newSession('ses_good'));
      await saveSession(db, newSession('ses_bad'));
      db.raw.prepare('UPDATE sessions SET data = ? WHERE id = ?').run('nonsense', 'ses_bad');

      expect((await listSessionSummaries(db)).map((s) => s.id)).toEqual(['ses_good']);
    });

    it('is empty on a fresh database', async () => {
      expect(await listSessionSummaries(db)).toEqual([]);
    });
  });

  describe('deleting', () => {
    it('removes a session', async () => {
      await saveSession(db, newSession());
      expect(await deleteSession(db, 'ses_1')).toBe(true);
      expect(await getSession(db, 'ses_1')).toBeNull();
    });

    it('reports false for one that was not there', async () => {
      expect(await deleteSession(db, 'ses_missing')).toBe(false);
    });
  });
});

describe('session parsing', () => {
  const valid = JSON.stringify(played(newSession()));

  it('accepts what it wrote', () => {
    expect(parseSession(valid)).not.toBeNull();
  });

  it.each(['', 'null', '[]', '"a session"', '{not json', '42'])('rejects %p', (raw) => {
    expect(parseSession(raw)).toBeNull();
  });

  it.each(['id', 'createdAt', 'settings', 'teams', 'rounds'])('rejects a missing %s', (field) => {
    const document = JSON.parse(valid) as Record<string, unknown>;
    delete document[field];
    expect(parseSession(JSON.stringify(document))).toBeNull();
  });

  it('rejects an unknown win condition rather than guessing one', () => {
    const document = JSON.parse(valid) as { settings: Record<string, unknown> };
    document.settings.winCondition = { kind: 'firstToDance' };
    expect(parseSession(JSON.stringify(document))).toBeNull();
  });

  /** One bad result would silently change a score. */
  it('rejects a round containing a malformed result', () => {
    const document = JSON.parse(valid) as { rounds: { results: unknown[] }[] };
    document.rounds[0]!.results[0] = { cardId: 'dck_1/crd_0', outcome: 'maybe', atMs: 0 };
    expect(parseSession(JSON.stringify(document))).toBeNull();
  });

  it('clamps a round length outside the supported range', () => {
    const document = JSON.parse(valid) as { settings: Record<string, unknown> };
    document.settings.roundSeconds = 9_999;
    expect(parseSession(JSON.stringify(document))?.settings.roundSeconds).toBe(180);
  });

  it('normalises a pass penalty that is neither 0 nor 1', () => {
    const document = JSON.parse(valid) as { settings: Record<string, unknown> };
    document.settings.passPenalty = 7;
    expect(parseSession(JSON.stringify(document))?.settings.passPenalty).toBe(0);
  });

  it('tolerates missing optional fields', () => {
    const document = JSON.parse(valid) as Record<string, unknown>;
    delete document.deckIds;
    delete document.seenCardIds;
    delete document.completedAt;

    const parsed = parseSession(JSON.stringify(document));
    expect(parsed?.deckIds).toEqual([]);
    expect(parsed?.seenCardIds).toEqual([]);
    expect(parsed?.completedAt).toBeNull();
  });
});
