/**
 * Schema migrations.
 *
 * The spec makes migration paths mandatory, not optional: nothing the user
 * creates can be lost, and that has to survive every future schema change.
 *
 * Rules for adding a migration:
 *
 *   1. Append. Never edit or reorder an existing entry — it has already run on
 *      real devices, and changing it means installed apps and fresh installs
 *      disagree about what the schema is.
 *   2. Never destroy user data. Add columns and tables. If a column must go,
 *      copy the data forward first.
 *   3. Keep each one runnable in isolation. The runner applies them in order
 *      from whatever version the device is on.
 *
 * The database driver is abstracted so this logic is testable without a native
 * SQLite module. See migrations.test.ts.
 */

export type MigrationDriver = {
  /** Runs one or more statements with no result. */
  execAsync(sql: string): Promise<void>;
  /** Returns the first row, or null. */
  getFirstAsync<T>(sql: string): Promise<T | null>;
};

export type Migration = {
  /** Target user_version after this runs. Must equal its 1-based position. */
  version: number;
  name: string;
  up: string;
};

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'decks and cards',
    up: `
      CREATE TABLE decks (
        id            TEXT PRIMARY KEY NOT NULL,
        schemaVersion INTEGER NOT NULL,
        name          TEXT NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        author        TEXT NOT NULL DEFAULT '',
        language      TEXT NOT NULL DEFAULT 'en',
        accentColor   TEXT NOT NULL,
        tags          TEXT NOT NULL DEFAULT '[]',
        source        TEXT NOT NULL CHECK (source IN ('bundled', 'custom')),
        createdAt     TEXT NOT NULL,
        updatedAt     TEXT NOT NULL
      );

      CREATE TABLE cards (
        id       TEXT NOT NULL,
        deckId   TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        text     TEXT NOT NULL,
        note     TEXT,
        position INTEGER NOT NULL,
        PRIMARY KEY (deckId, id)
      );

      CREATE INDEX cards_by_deck ON cards (deckId, position);
      CREATE INDEX decks_by_source ON decks (source, name);
    `,
  },
  {
    version: 2,
    name: 'sessions',
    /**
     * Sessions are stored as a JSON document with a few columns lifted out for
     * listing and for finding the one in progress.
     *
     * This is the opposite choice to decks, deliberately. A deck is queried
     * across — card counts for every deck at once, search over card text, and
     * per-card reordering — so it is normalised. A session is only ever read
     * whole and written whole, and its shape (teams, rounds, results) would
     * need four tables and four joins to reassemble something that is a few
     * kilobytes of JSON.
     */
    up: `
      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY NOT NULL,
        createdAt    TEXT NOT NULL,
        completedAt  TEXT,
        data         TEXT NOT NULL
      );

      CREATE INDEX sessions_by_created ON sessions (createdAt DESC);
      CREATE INDEX sessions_in_progress ON sessions (completedAt, createdAt DESC);
    `,
  },
];

/**
 * Card ids are unique per deck rather than globally, because a duplicated deck
 * keeps its cards' text but must not share their identity. Exported so the
 * seeder and repository agree on how a card is addressed across decks.
 */
export function seenCardKey(deckId: string, cardId: string): string {
  return `${deckId}/${cardId}`;
}

export const LATEST_SCHEMA_VERSION = migrations.length;

export class MigrationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'MigrationError';
  }
}

/**
 * Brings the database up to the latest schema version.
 *
 * Returns the versions actually applied, which is empty on an already-current
 * database. Idempotent: safe to call on every launch.
 */
export async function migrate(db: MigrationDriver): Promise<number[]> {
  assertMigrationsWellFormed();

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current > LATEST_SCHEMA_VERSION) {
    // The user installed a newer build, then downgraded. Their data is in a
    // shape this build cannot read. Failing loudly beats writing to it and
    // corrupting decks the newer build could still have opened.
    throw new MigrationError(
      `This app is older than the data on this device (data version ${current}, app reads up to ${LATEST_SCHEMA_VERSION}). Update Deckhead to open your decks.`,
    );
  }

  const applied: number[] = [];

  for (const migration of migrations) {
    if (migration.version <= current) continue;

    try {
      // Each migration is its own transaction, so a failure part-way through
      // leaves the database on the last version that fully succeeded rather
      // than in a half-migrated state.
      await db.execAsync(`BEGIN;
${migration.up}
PRAGMA user_version = ${migration.version};
COMMIT;`);
    } catch (error) {
      try {
        await db.execAsync('ROLLBACK;');
      } catch {
        // The transaction may already have been rolled back by SQLite. The
        // original failure is the one worth reporting.
      }
      throw new MigrationError(
        `Could not update the deck database (step ${migration.version}, ${migration.name}).`,
        error,
      );
    }

    applied.push(migration.version);
  }

  return applied;
}

/** Guards the append-only rule at startup rather than at first user report. */
function assertMigrationsWellFormed(): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new MigrationError(
        `Migration list is malformed: entry ${index} declares version ${migration.version}, expected ${index + 1}.`,
      );
    }
  });
}
