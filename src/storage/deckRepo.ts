import type { Card, Deck, DeckSource, DeckSummary, StoredDeck } from '@/decks/types';
import type { Sql, SqlValue } from './sql';

/**
 * Reading and writing decks.
 *
 * Storage is normalised into decks and cards rather than a JSON blob per deck,
 * because the browser needs card counts for every deck in one query, search
 * needs to match card text, and M4 needs per-card reordering. See
 * spec/decisions.md.
 */

type DeckRow = {
  id: string;
  schemaVersion: number;
  name: string;
  description: string;
  author: string;
  language: string;
  accentColor: string;
  tags: string;
  source: DeckSource;
  createdAt: string;
  updatedAt: string;
};

type SummaryRow = Omit<DeckRow, 'schemaVersion' | 'language'> & { cardCount: number };

type CardRow = { id: string; text: string; note: string | null };

/**
 * Tags are stored as a JSON array in a text column. They are only ever read and
 * written whole, never queried across, so a join table would buy nothing. A
 * corrupt value degrades to no tags rather than failing the read — losing a
 * label is recoverable, losing the deck is not.
 */
function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function toSummary(row: SummaryRow): DeckSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    author: row.author,
    accentColor: row.accentColor,
    tags: parseTags(row.tags),
    source: row.source,
    cardCount: row.cardCount,
    updatedAt: row.updatedAt,
  };
}

const SUMMARY_SELECT = `
  SELECT d.id, d.name, d.description, d.author, d.accentColor, d.tags, d.source,
         d.createdAt, d.updatedAt,
         (SELECT COUNT(*) FROM cards c WHERE c.deckId = d.id) AS cardCount
  FROM decks d
`;

/** Bundled decks first, then custom, each alphabetical. */
const SUMMARY_ORDER = `ORDER BY CASE d.source WHEN 'bundled' THEN 0 ELSE 1 END, d.name COLLATE NOCASE`;

export async function listDeckSummaries(db: Sql): Promise<DeckSummary[]> {
  const rows = await db.getAllAsync<SummaryRow>(`${SUMMARY_SELECT} ${SUMMARY_ORDER}`, []);
  return rows.map(toSummary);
}

/**
 * Searches deck names, descriptions, tags and card text.
 *
 * Card text is included because people remember a deck by something in it more
 * often than by what it is called.
 */
export async function searchDeckSummaries(db: Sql, query: string): Promise<DeckSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return listDeckSummaries(db);

  // LIKE with an escaped pattern rather than FTS: the deck count on a phone is
  // small, and this avoids a second table to keep in sync on every edit.
  const pattern = `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const rows = await db.getAllAsync<SummaryRow>(
    `${SUMMARY_SELECT}
     WHERE d.name LIKE ?1 ESCAPE '\\'
        OR d.description LIKE ?1 ESCAPE '\\'
        OR d.tags LIKE ?1 ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM cards c WHERE c.deckId = d.id AND c.text LIKE ?1 ESCAPE '\\')
     ${SUMMARY_ORDER}`,
    [pattern],
  );

  return rows.map(toSummary);
}

export async function getDeck(db: Sql, deckId: string): Promise<StoredDeck | null> {
  const row = await db.getFirstAsync<DeckRow>('SELECT * FROM decks WHERE id = ?', [deckId]);
  if (!row) return null;

  const cards = await db.getAllAsync<CardRow>(
    'SELECT id, text, note FROM cards WHERE deckId = ? ORDER BY position',
    [deckId],
  );

  return {
    schemaVersion: row.schemaVersion,
    id: row.id,
    name: row.name,
    description: row.description,
    author: row.author,
    language: row.language,
    accentColor: row.accentColor,
    tags: parseTags(row.tags),
    source: row.source,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    cards: cards.map((c): Card => ({ id: c.id, text: c.text, note: c.note })),
  };
}

export async function getDeckSummary(db: Sql, deckId: string): Promise<DeckSummary | null> {
  const row = await db.getFirstAsync<SummaryRow>(`${SUMMARY_SELECT} WHERE d.id = ?`, [deckId]);
  return row ? toSummary(row) : null;
}

export async function countDecks(db: Sql, source?: DeckSource): Promise<number> {
  const row = source
    ? await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM decks WHERE source = ?', [
        source,
      ])
    : await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM decks', []);
  return row?.n ?? 0;
}

/**
 * Writes a deck and its cards, replacing any existing deck with the same id.
 *
 * Cards are deleted and reinserted rather than diffed. Card ids are supplied by
 * the caller and preserved exactly, so a rewrite does not disturb seen-card
 * tracking; position comes from array order, which is what the M4 editor
 * reorders.
 */
export async function upsertDeck(db: Sql, deck: Deck, source: DeckSource): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO decks (id, schemaVersion, name, description, author, language, accentColor, tags, source, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         schemaVersion = excluded.schemaVersion,
         name          = excluded.name,
         description   = excluded.description,
         author        = excluded.author,
         language      = excluded.language,
         accentColor   = excluded.accentColor,
         tags          = excluded.tags,
         source        = excluded.source,
         updatedAt     = excluded.updatedAt`,
      [
        deck.id,
        deck.schemaVersion,
        deck.name,
        deck.description,
        deck.author,
        deck.language,
        deck.accentColor,
        JSON.stringify(deck.tags),
        source,
        deck.createdAt,
        deck.updatedAt,
      ],
    );

    await db.runAsync('DELETE FROM cards WHERE deckId = ?', [deck.id]);

    for (const [position, card] of deck.cards.entries()) {
      await db.runAsync(
        'INSERT INTO cards (id, deckId, text, note, position) VALUES (?, ?, ?, ?, ?)',
        [card.id, deck.id, card.text, card.note, position] satisfies SqlValue[],
      );
    }
  });
}

/** Returns false when the deck was not there. Cards go with it via cascade. */
export async function deleteDeck(db: Sql, deckId: string): Promise<boolean> {
  const result = await db.runAsync('DELETE FROM decks WHERE id = ?', [deckId]);
  return result.changes > 0;
}

export async function deckExists(db: Sql, deckId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM decks WHERE id = ?', [
    deckId,
  ]);
  return (row?.n ?? 0) > 0;
}
