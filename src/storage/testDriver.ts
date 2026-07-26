import { DatabaseSync } from 'node:sqlite';
import type { MigrationDriver } from './migrations';
import type { Sql, SqlValue } from './sql';

/**
 * A Sql implementation backed by real in-memory SQLite, for tests.
 *
 * Node ships a SQLite build, so storage tests execute actual SQL against an
 * actual engine rather than asserting that some strings were passed to a mock.
 * A typo in a CREATE TABLE or a broken join fails here instead of on a device.
 *
 * Test-only. App code uses expo-sqlite; see database.ts.
 */
export type TestDriver = Sql &
  MigrationDriver & {
    raw: DatabaseSync;
    close(): void;
    tableNames(): string[];
    columnNames(table: string): string[];
    userVersion(): number;
  };

export function createTestDriver(): TestDriver {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  let transactionDepth = 0;

  return {
    raw: db,

    async execAsync(sql: string): Promise<void> {
      db.exec(sql);
    },

    async runAsync(sql: string, params: SqlValue[] = []) {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },

    async getFirstAsync<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
      const row = db.prepare(sql).get(...params);
      return (row as T | undefined) ?? null;
    },

    async getAllAsync<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },

    /**
     * Mirrors expo-sqlite's withTransactionAsync: commit on resolve, roll back
     * on throw. Nesting uses savepoints, since SQLite has no nested BEGIN.
     */
    async withTransactionAsync(work: () => Promise<void>): Promise<void> {
      const depth = transactionDepth;
      const savepoint = `sp_${depth}`;
      transactionDepth += 1;

      db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${savepoint}`);
      try {
        await work();
        db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
      } catch (error) {
        db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}`);
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    },

    close() {
      db.close();
    },

    tableNames() {
      return db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((r) => (r as { name: string }).name);
    },

    columnNames(table: string) {
      return db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((r) => (r as { name: string }).name);
    },

    userVersion() {
      const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
      return row.user_version;
    },
  };
}
