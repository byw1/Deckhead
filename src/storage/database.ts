import * as SQLite from 'expo-sqlite';
import { migrate } from './migrations';
import type { Sql } from './sql';

/**
 * The app's database handle.
 *
 * expo-sqlite's SQLiteDatabase already satisfies Sql, so the repository works
 * against the real database in the app and against Node's SQLite in tests
 * without a compatibility layer.
 */

export const DATABASE_NAME = 'deckhead.db';

let openPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens the database, applies migrations and returns the handle.
 *
 * Cached, so concurrent callers during startup share one open and one
 * migration run rather than racing. A failed open is not cached: a transient
 * failure should not poison the handle for the rest of the session.
 */
export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  openPromise ??= openAndMigrate().catch((error: unknown) => {
    openPromise = null;
    throw error;
  });
  return openPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // WAL is not guaranteed on by default. Foreign keys are off by default in
  // SQLite and the cards table relies on ON DELETE CASCADE, so this is load
  // bearing rather than hygiene.
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  await migrate(db satisfies Sql);
  return db;
}

/** Test and development seam. Does not delete anything. */
export function resetDatabaseHandleForTests(): void {
  openPromise = null;
}
