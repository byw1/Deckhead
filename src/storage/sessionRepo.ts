import type { Session } from '@/game/types';
import { parseSession, type SessionSummary } from './sessionSchema';
import type { Sql } from './sql';

/**
 * Reading and writing sessions.
 *
 * Sessions round-trip through JSON, so every read validates before handing
 * back a Session. A session written by a newer build, or corrupted on disk,
 * returns null rather than a half-typed object that breaks somewhere deeper.
 */

type SessionRow = { id: string; createdAt: string; completedAt: string | null; data: string };

type SummaryRow = Omit<SessionRow, 'data'> & { data: string };

export async function saveSession(db: Sql, session: Session): Promise<void> {
  await db.runAsync(
    `INSERT INTO sessions (id, createdAt, completedAt, data)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       completedAt = excluded.completedAt,
       data        = excluded.data`,
    [session.id, session.createdAt, session.completedAt, JSON.stringify(session)],
  );
}

export async function getSession(db: Sql, sessionId: string): Promise<Session | null> {
  const row = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  return row ? parseSession(row.data) : null;
}

/**
 * The session to offer resuming on the home screen.
 *
 * Most recent unfinished session. There is only ever one in practice, but
 * ordering makes the answer deterministic if a crash ever left two.
 */
export async function getResumableSession(db: Sql): Promise<Session | null> {
  const row = await db.getFirstAsync<SessionRow>(
    'SELECT * FROM sessions WHERE completedAt IS NULL ORDER BY createdAt DESC LIMIT 1',
    [],
  );
  if (!row) return null;

  const session = parseSession(row.data);
  if (!session) {
    // Unreadable. Drop it rather than offering a resume that cannot work.
    await deleteSession(db, row.id);
    return null;
  }

  return session;
}

/** Session history, newest first. */
export async function listSessionSummaries(db: Sql, limit = 50): Promise<SessionSummary[]> {
  const rows = await db.getAllAsync<SummaryRow>(
    'SELECT * FROM sessions ORDER BY createdAt DESC LIMIT ?',
    [limit],
  );

  return rows.flatMap((row) => {
    const session = parseSession(row.data);
    if (!session) return [];

    return [
      {
        id: session.id,
        createdAt: session.createdAt,
        completedAt: session.completedAt,
        teamNames: session.teams.map((t) => t.name),
        roundCount: session.rounds.filter((r) => r.endedAt !== null).length,
      },
    ];
  });
}

export async function deleteSession(db: Sql, sessionId: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM sessions WHERE id = ?', [sessionId]);
  return result.changes > 0;
}

/**
 * Removes unfinished sessions other than the one given.
 *
 * Starting a new game abandons any half-played one. Keeping them would mean
 * the home screen has to ask which to resume, which is a question nobody wants.
 */
export async function discardOtherUnfinishedSessions(db: Sql, keepId: string): Promise<number> {
  const result = await db.runAsync(
    'DELETE FROM sessions WHERE completedAt IS NULL AND id != ?',
    [keepId],
  );
  return result.changes;
}

export async function countSessions(db: Sql): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sessions', []);
  return row?.n ?? 0;
}
