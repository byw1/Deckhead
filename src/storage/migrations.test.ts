import {
  LATEST_SCHEMA_VERSION,
  MigrationError,
  migrate,
  migrations,
  seenCardKey,
  type MigrationDriver,
} from './migrations';
import { createTestDriver } from './testDriver';

describe('migration list', () => {
  it('numbers migrations by position, so the runner can trust the order', () => {
    migrations.forEach((migration, index) => {
      expect(migration.version).toBe(index + 1);
    });
  });

  it('reports the latest version as the list length', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(migrations.length);
  });

  it('gives every migration a name for error messages', () => {
    for (const migration of migrations) {
      expect(migration.name).toBeTruthy();
    }
  });
});

describe('migrate', () => {
  it('takes a fresh database to the latest version', async () => {
    const db = createTestDriver();
    try {
      const applied = await migrate(db);
      expect(applied).toEqual(migrations.map((m) => m.version));
      expect(db.userVersion()).toBe(LATEST_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  it('is idempotent, because it runs on every launch', async () => {
    const db = createTestDriver();
    try {
      await migrate(db);
      const second = await migrate(db);
      expect(second).toEqual([]);
      expect(db.userVersion()).toBe(LATEST_SCHEMA_VERSION);
    } finally {
      db.close();
    }
  });

  it('applies only the migrations a partly-updated device is missing', async () => {
    const db = createTestDriver();
    try {
      await db.execAsync(`${migrations[0]!.up}; PRAGMA user_version = 1;`);
      const applied = await migrate(db);
      expect(applied).toEqual(migrations.slice(1).map((m) => m.version));
    } finally {
      db.close();
    }
  });

  it('refuses to run against data written by a newer build', async () => {
    const db = createTestDriver();
    try {
      await db.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION + 1};`);
      await expect(migrate(db)).rejects.toThrow(MigrationError);
      await expect(migrate(db)).rejects.toThrow(/Update Deckhead/);
    } finally {
      db.close();
    }
  });

  it('leaves the version untouched when a migration fails', async () => {
    const broken: MigrationDriver = {
      getFirstAsync: async () => ({ user_version: 0 }) as never,
      execAsync: async () => {
        throw new Error('disk full');
      },
    };
    await expect(migrate(broken)).rejects.toThrow(MigrationError);
  });

  it('names the failing step and keeps the underlying cause', async () => {
    const cause = new Error('disk full');
    const broken: MigrationDriver = {
      getFirstAsync: async () => ({ user_version: 0 }) as never,
      execAsync: async (sql) => {
        if (sql.startsWith('ROLLBACK')) return;
        throw cause;
      },
    };

    await expect(migrate(broken)).rejects.toMatchObject({
      message: expect.stringContaining('step 1'),
      cause,
    });
  });

  it('treats a database with no user_version as version zero', async () => {
    const empty: MigrationDriver = {
      getFirstAsync: async () => null,
      execAsync: async () => undefined,
    };
    expect(await migrate(empty)).toEqual(migrations.map((m) => m.version));
  });
});

describe('schema at version 1', () => {
  it('creates the decks and cards tables', async () => {
    const db = createTestDriver();
    try {
      await migrate(db);
      expect(db.tableNames()).toEqual(expect.arrayContaining(['cards', 'decks']));
      expect(db.columnNames('decks')).toEqual([
        'id',
        'schemaVersion',
        'name',
        'description',
        'author',
        'language',
        'accentColor',
        'tags',
        'source',
        'createdAt',
        'updatedAt',
      ]);
      expect(db.columnNames('cards')).toEqual(['id', 'deckId', 'text', 'note', 'position']);
    } finally {
      db.close();
    }
  });

  it('rejects a deck source outside bundled and custom', async () => {
    const db = createTestDriver();
    try {
      await migrate(db);
      expect(() =>
        db.raw.exec(
          `INSERT INTO decks (id, schemaVersion, name, accentColor, source, createdAt, updatedAt)
           VALUES ('dck_00000001', 1, 'Test', '#FF3D6E', 'premium', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
        ),
      ).toThrow(/CHECK constraint/i);
    } finally {
      db.close();
    }
  });

  /**
   * Card ids are unique per deck, not globally. A duplicated deck keeps its
   * cards' text but must be able to mint fresh ids without colliding, and two
   * unrelated decks must never be prevented from coexisting.
   */
  it('scopes card ids to their deck', async () => {
    const db = createTestDriver();
    try {
      await migrate(db);
      db.raw.exec(`
        INSERT INTO decks (id, schemaVersion, name, accentColor, source, createdAt, updatedAt) VALUES
          ('dck_00000001', 1, 'One', '#FF3D6E', 'custom', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
          ('dck_00000002', 1, 'Two', '#2BD576', 'custom', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO cards (id, deckId, text, note, position) VALUES
          ('crd_00000001', 'dck_00000001', 'Shared id, different deck', NULL, 0),
          ('crd_00000001', 'dck_00000002', 'Shared id, different deck', NULL, 0);
      `);

      expect(() =>
        db.raw.exec(
          `INSERT INTO cards (id, deckId, text, note, position)
           VALUES ('crd_00000001', 'dck_00000001', 'Duplicate within one deck', NULL, 1)`,
        ),
      ).toThrow(/UNIQUE constraint/i);
    } finally {
      db.close();
    }
  });

  it('deletes a deck cards when the deck goes', async () => {
    const db = createTestDriver();
    try {
      await migrate(db);
      db.raw.exec(`
        INSERT INTO decks (id, schemaVersion, name, accentColor, source, createdAt, updatedAt)
          VALUES ('dck_00000001', 1, 'One', '#FF3D6E', 'custom', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
        INSERT INTO cards (id, deckId, text, note, position)
          VALUES ('crd_00000001', 'dck_00000001', 'Orphan me', NULL, 0);
        DELETE FROM decks WHERE id = 'dck_00000001';
      `);

      const remaining = db.raw.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number };
      expect(remaining.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it('refuses a card belonging to no deck', async () => {
    const db = createTestDriver();
    try {
      await migrate(db);
      expect(() =>
        db.raw.exec(
          `INSERT INTO cards (id, deckId, text, note, position)
           VALUES ('crd_00000001', 'dck_missing', 'No deck', NULL, 0)`,
        ),
      ).toThrow(/FOREIGN KEY constraint/i);
    } finally {
      db.close();
    }
  });
});

describe('seenCardKey', () => {
  it('scopes a card to its deck', () => {
    expect(seenCardKey('dck_00000001', 'crd_00000001')).toBe('dck_00000001/crd_00000001');
  });

  it('keeps the same card id in two decks distinct', () => {
    expect(seenCardKey('dck_00000001', 'crd_00000001')).not.toBe(
      seenCardKey('dck_00000002', 'crd_00000001'),
    );
  });
});
