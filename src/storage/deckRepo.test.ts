import { makeCardId, makeDeckId } from '@/decks/ids';
import { CURRENT_DECK_SCHEMA_VERSION, type Deck, type DeckSource } from '@/decks/types';
import {
  countDecks,
  deckExists,
  deleteDeck,
  getDeck,
  getDeckSummary,
  listDeckSummaries,
  searchDeckSummaries,
  upsertDeck,
} from './deckRepo';
import { migrate } from './migrations';
import { createTestDriver, type TestDriver } from './testDriver';

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    id: makeDeckId(),
    name: 'Test Deck',
    description: 'A deck for testing.',
    author: 'will',
    language: 'en',
    accentColor: '#FF3D6E',
    tags: ['test'],
    createdAt: '2026-07-26T18:00:00Z',
    updatedAt: '2026-07-26T18:00:00Z',
    cards: [
      { id: makeCardId(), text: 'First', note: null },
      { id: makeCardId(), text: 'Second', note: 'a hint' },
    ],
    ...overrides,
  };
}

describe('deck repository', () => {
  let db: TestDriver;

  beforeEach(async () => {
    db = createTestDriver();
    await migrate(db);
  });

  afterEach(() => db.close());

  const save = (deck: Deck, source: DeckSource = 'custom') => upsertDeck(db, deck, source);

  describe('round trip', () => {
    it('returns a deck exactly as it went in', async () => {
      const deck = makeDeck();
      await save(deck);
      expect(await getDeck(db, deck.id)).toEqual({ ...deck, source: 'custom' });
    });

    it('preserves card order', async () => {
      const deck = makeDeck({
        cards: Array.from({ length: 20 }, (_, i) => ({
          id: makeCardId(),
          text: `Card ${i}`,
          note: null,
        })),
      });
      await save(deck);
      const loaded = await getDeck(db, deck.id);
      expect(loaded?.cards.map((c) => c.text)).toEqual(deck.cards.map((c) => c.text));
    });

    it('preserves card ids, because seen-card tracking depends on them', async () => {
      const deck = makeDeck();
      await save(deck);
      const loaded = await getDeck(db, deck.id);
      expect(loaded?.cards.map((c) => c.id)).toEqual(deck.cards.map((c) => c.id));
    });

    it('keeps a null note null rather than turning it into an empty string', async () => {
      const deck = makeDeck();
      await save(deck);
      expect((await getDeck(db, deck.id))?.cards[0]?.note).toBeNull();
    });

    it('returns null for a deck that is not there', async () => {
      expect(await getDeck(db, makeDeckId())).toBeNull();
    });

    it('handles a deck with no cards', async () => {
      const deck = makeDeck({ cards: [] });
      await save(deck);
      expect((await getDeck(db, deck.id))?.cards).toEqual([]);
    });

    it('survives text that would break naive SQL', async () => {
      const nasty = `Bobby'); DROP TABLE decks;--`;
      const deck = makeDeck({
        name: nasty,
        cards: [{ id: makeCardId(), text: nasty, note: nasty }],
      });
      await save(deck);

      const loaded = await getDeck(db, deck.id);
      expect(loaded?.name).toBe(nasty);
      expect(loaded?.cards[0]?.text).toBe(nasty);
      expect(db.tableNames()).toContain('decks');
    });

    it('survives emoji and non-Latin text', async () => {
      const deck = makeDeck({
        name: 'Ñoño 日本語 🎉',
        cards: [{ id: makeCardId(), text: '🍕 ピザ', note: null }],
      });
      await save(deck);
      expect((await getDeck(db, deck.id))?.cards[0]?.text).toBe('🍕 ピザ');
    });
  });

  describe('upsert', () => {
    it('replaces an existing deck rather than duplicating it', async () => {
      const deck = makeDeck();
      await save(deck);
      await save({ ...deck, name: 'Renamed', updatedAt: '2026-07-27T10:00:00Z' });

      expect(await countDecks(db)).toBe(1);
      const loaded = await getDeck(db, deck.id);
      expect(loaded?.name).toBe('Renamed');
      expect(loaded?.updatedAt).toBe('2026-07-27T10:00:00Z');
    });

    it('does not move createdAt on update', async () => {
      const deck = makeDeck();
      await save(deck);
      await save({ ...deck, createdAt: '2030-01-01T00:00:00Z' });
      expect((await getDeck(db, deck.id))?.createdAt).toBe(deck.createdAt);
    });

    it('leaves no orphan cards when a deck shrinks', async () => {
      const deck = makeDeck();
      await save(deck);
      await save({ ...deck, cards: [deck.cards[0]!] });

      const cards = db.raw.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number };
      expect(cards.n).toBe(1);
    });

    /**
     * The write is one transaction, so a failure part-way cannot leave a deck
     * with half its cards. Nothing the user creates can be lost, and that
     * includes not being silently truncated.
     */
    it('rolls back completely when a card write fails', async () => {
      const deck = makeDeck();
      await save(deck);

      const duplicated = makeDeck({
        id: deck.id,
        name: 'Should not persist',
        cards: [
          { id: 'crd_00000001', text: 'One', note: null },
          { id: 'crd_00000001', text: 'Duplicate id', note: null },
        ],
      });

      await expect(save(duplicated)).rejects.toThrow();

      const loaded = await getDeck(db, deck.id);
      expect(loaded?.name).toBe('Test Deck');
      expect(loaded?.cards).toHaveLength(2);
    });

    it('lets two decks hold cards with the same id', async () => {
      const sharedId = makeCardId();
      const cards = [{ id: sharedId, text: 'Same id', note: null }];
      const a = makeDeck({ cards });
      const b = makeDeck({ cards });

      await save(a);
      await save(b);

      expect((await getDeck(db, a.id))?.cards[0]?.id).toBe(sharedId);
      expect((await getDeck(db, b.id))?.cards[0]?.id).toBe(sharedId);
    });
  });

  describe('summaries', () => {
    it('counts cards without loading them', async () => {
      const deck = makeDeck({
        cards: Array.from({ length: 42 }, (_, i) => ({
          id: makeCardId(),
          text: `Card ${i}`,
          note: null,
        })),
      });
      await save(deck);
      expect((await getDeckSummary(db, deck.id))?.cardCount).toBe(42);
    });

    it('reports zero for an empty deck', async () => {
      const deck = makeDeck({ cards: [] });
      await save(deck);
      expect((await getDeckSummary(db, deck.id))?.cardCount).toBe(0);
    });

    it('lists bundled decks before custom ones, each alphabetically', async () => {
      await save(makeDeck({ name: 'Zebra' }), 'bundled');
      await save(makeDeck({ name: 'Apple' }), 'custom');
      await save(makeDeck({ name: 'Alpha' }), 'bundled');
      await save(makeDeck({ name: 'Beta' }), 'custom');

      expect((await listDeckSummaries(db)).map((d) => d.name)).toEqual([
        'Alpha',
        'Zebra',
        'Apple',
        'Beta',
      ]);
    });

    it('sorts case insensitively', async () => {
      await save(makeDeck({ name: 'banana' }));
      await save(makeDeck({ name: 'Apple' }));
      expect((await listDeckSummaries(db)).map((d) => d.name)).toEqual(['Apple', 'banana']);
    });

    it('round-trips tags', async () => {
      const deck = makeDeck({ tags: ['music', 'nostalgia'] });
      await save(deck);
      expect((await getDeckSummary(db, deck.id))?.tags).toEqual(['music', 'nostalgia']);
    });

    it('degrades a corrupt tags value to no tags rather than failing the read', async () => {
      const deck = makeDeck();
      await save(deck);
      db.raw.prepare('UPDATE decks SET tags = ? WHERE id = ?').run('{not json', deck.id);
      expect((await getDeckSummary(db, deck.id))?.tags).toEqual([]);
    });

    it('is empty on a fresh database', async () => {
      expect(await listDeckSummaries(db)).toEqual([]);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await save(
        makeDeck({
          name: '2000s Emo Bands',
          description: 'For people who owned a studded belt.',
          tags: ['music'],
          cards: [{ id: makeCardId(), text: 'My Chemical Romance', note: null }],
        }),
      );
      await save(
        makeDeck({
          name: 'Kitchen Things',
          description: 'Household objects.',
          tags: ['home'],
          cards: [{ id: makeCardId(), text: 'Colander', note: null }],
        }),
      );
    });

    it('matches on deck name', async () => {
      expect((await searchDeckSummaries(db, 'emo')).map((d) => d.name)).toEqual(['2000s Emo Bands']);
    });

    it('matches on description', async () => {
      expect((await searchDeckSummaries(db, 'studded')).map((d) => d.name)).toEqual([
        '2000s Emo Bands',
      ]);
    });

    it('matches on tag', async () => {
      expect((await searchDeckSummaries(db, 'home')).map((d) => d.name)).toEqual(['Kitchen Things']);
    });

    it('matches on card text, because people remember a deck by what is in it', async () => {
      expect((await searchDeckSummaries(db, 'colander')).map((d) => d.name)).toEqual([
        'Kitchen Things',
      ]);
    });

    it('returns each deck once even when several cards match', async () => {
      await save(
        makeDeck({
          name: 'Repeats',
          cards: [
            { id: makeCardId(), text: 'match one', note: null },
            { id: makeCardId(), text: 'match two', note: null },
          ],
        }),
      );
      expect(await searchDeckSummaries(db, 'match')).toHaveLength(1);
    });

    it('ignores case', async () => {
      expect(await searchDeckSummaries(db, 'EMO')).toHaveLength(1);
    });

    it('returns everything for a blank or whitespace query', async () => {
      expect(await searchDeckSummaries(db, '')).toHaveLength(2);
      expect(await searchDeckSummaries(db, '   ')).toHaveLength(2);
    });

    it('returns nothing when nothing matches', async () => {
      expect(await searchDeckSummaries(db, 'zzzznope')).toEqual([]);
    });

    /** Otherwise a stray % from a user typing would match every deck. */
    it('treats LIKE wildcards as literal characters', async () => {
      expect(await searchDeckSummaries(db, '%')).toEqual([]);
      expect(await searchDeckSummaries(db, '_')).toEqual([]);

      await save(makeDeck({ name: '100% Cotton' }));
      expect((await searchDeckSummaries(db, '100%')).map((d) => d.name)).toEqual(['100% Cotton']);
    });
  });

  describe('delete', () => {
    it('removes the deck and its cards', async () => {
      const deck = makeDeck();
      await save(deck);

      expect(await deleteDeck(db, deck.id)).toBe(true);
      expect(await getDeck(db, deck.id)).toBeNull();

      const cards = db.raw.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number };
      expect(cards.n).toBe(0);
    });

    it('reports false for a deck that was not there', async () => {
      expect(await deleteDeck(db, makeDeckId())).toBe(false);
    });

    it('leaves other decks alone', async () => {
      const keep = makeDeck({ name: 'Keep' });
      const drop = makeDeck({ name: 'Drop' });
      await save(keep);
      await save(drop);

      await deleteDeck(db, drop.id);
      expect((await listDeckSummaries(db)).map((d) => d.name)).toEqual(['Keep']);
    });
  });

  describe('counts and existence', () => {
    it('counts by source', async () => {
      await save(makeDeck(), 'bundled');
      await save(makeDeck(), 'bundled');
      await save(makeDeck(), 'custom');

      expect(await countDecks(db)).toBe(3);
      expect(await countDecks(db, 'bundled')).toBe(2);
      expect(await countDecks(db, 'custom')).toBe(1);
    });

    it('reports whether a deck id is taken, which import needs in M5', async () => {
      const deck = makeDeck();
      expect(await deckExists(db, deck.id)).toBe(false);
      await save(deck);
      expect(await deckExists(db, deck.id)).toBe(true);
    });
  });
});
