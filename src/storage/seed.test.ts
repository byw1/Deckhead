import { bundledDeckDocuments } from '@/decks/bundled';
import { CARD_TEXT_SOFT_CAP, MIN_PLAYABLE_CARDS } from '@/decks/types';
import { validateDeck } from '@/decks/validate';
import { countDecks, getDeck, listDeckSummaries, upsertDeck } from './deckRepo';
import { migrate } from './migrations';
import { seedBundledDecks } from './seed';
import { createTestDriver, type TestDriver } from './testDriver';

/**
 * The bundled decks go through the same validator as an imported deck. A deck
 * is not trusted because it happens to live in the repo.
 */
describe('bundled deck content', () => {
  it('ships five decks', () => {
    expect(bundledDeckDocuments).toHaveLength(5);
  });

  it.each(bundledDeckDocuments.map((d, i) => [i, d] as const))(
    'deck %i passes validation',
    (_index, document) => {
      const result = validateDeck(document);
      if (!result.ok) {
        throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
      }
      expect(result.warnings).toEqual([]);
    },
  );

  it('gives every deck enough cards to start a round', () => {
    for (const document of bundledDeckDocuments) {
      const result = validateDeck(document);
      if (!result.ok) throw new Error('invalid deck');
      expect(result.deck.cards.length).toBeGreaterThanOrEqual(MIN_PLAYABLE_CARDS);
    }
  });

  it('keeps every card under the legibility soft cap', () => {
    for (const document of bundledDeckDocuments) {
      const result = validateDeck(document);
      if (!result.ok) throw new Error('invalid deck');
      for (const card of result.deck.cards) {
        expect(card.text.length).toBeLessThanOrEqual(CARD_TEXT_SOFT_CAP);
      }
    }
  });

  it('gives every deck a distinct id and name', () => {
    const decks = bundledDeckDocuments.map((d) => {
      const result = validateDeck(d);
      if (!result.ok) throw new Error('invalid deck');
      return result.deck;
    });

    expect(new Set(decks.map((d) => d.id)).size).toBe(decks.length);
    expect(new Set(decks.map((d) => d.name)).size).toBe(decks.length);
  });

  /**
   * Card ids are unique per deck, so a repeat across decks is not a data
   * error — but for content generated from a hash of slug plus text it would
   * mean two decks share a slug, which is a build mistake.
   */
  it('does not repeat a card id across decks', () => {
    const seen = new Set<string>();
    for (const document of bundledDeckDocuments) {
      const result = validateDeck(document);
      if (!result.ok) throw new Error('invalid deck');
      for (const card of result.deck.cards) {
        expect(seen.has(card.id)).toBe(false);
        seen.add(card.id);
      }
    }
  });

  it('does not repeat a card within a deck', () => {
    for (const document of bundledDeckDocuments) {
      const result = validateDeck(document);
      if (!result.ok) throw new Error('invalid deck');
      const texts = result.deck.cards.map((c) => c.text.toLowerCase());
      expect(new Set(texts).size).toBe(texts.length);
    }
  });

  /** Repo hygiene rule from the spec, enforced rather than remembered. */
  it('contains no reference to the incumbent', () => {
    const serialised = JSON.stringify(bundledDeckDocuments).toLowerCase();
    expect(serialised).not.toMatch(/heads\s*-?\s*up/);
  });
});

describe('seeding', () => {
  let db: TestDriver;

  beforeEach(async () => {
    db = createTestDriver();
    await migrate(db);
  });

  afterEach(() => db.close());

  it('installs every bundled deck on a fresh database', async () => {
    const report = await seedBundledDecks(db);

    expect(report.rejected).toEqual([]);
    expect(report.inserted).toHaveLength(bundledDeckDocuments.length);
    expect(await countDecks(db, 'bundled')).toBe(bundledDeckDocuments.length);
  });

  it('marks them as bundled, not custom', async () => {
    await seedBundledDecks(db);
    for (const summary of await listDeckSummaries(db)) {
      expect(summary.source).toBe('bundled');
    }
  });

  it('writes cards, not just deck rows', async () => {
    await seedBundledDecks(db);
    for (const summary of await listDeckSummaries(db)) {
      expect(summary.cardCount).toBeGreaterThanOrEqual(MIN_PLAYABLE_CARDS);
    }
  });

  it('changes nothing on the second launch', async () => {
    await seedBundledDecks(db);
    const second = await seedBundledDecks(db);

    expect(second.inserted).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.unchanged).toHaveLength(bundledDeckDocuments.length);
    expect(await countDecks(db)).toBe(bundledDeckDocuments.length);
  });

  it('rewrites a bundled deck whose content moved forward in an app update', async () => {
    await seedBundledDecks(db);

    const [first] = await listDeckSummaries(db);
    const stored = await getDeck(db, first!.id);

    // Simulate the device holding an older copy than the app now ships.
    await upsertDeck(
      db,
      { ...stored!, name: 'Old name', updatedAt: '2020-01-01T00:00:00Z' },
      'bundled',
    );

    const report = await seedBundledDecks(db);
    expect(report.updated).toContain(first!.id);
    expect((await getDeck(db, first!.id))?.name).toBe(first!.name);
  });

  it('does not rewrite a bundled deck the device already has at the same version', async () => {
    await seedBundledDecks(db);
    const [first] = await listDeckSummaries(db);

    await upsertDeck(db, { ...(await getDeck(db, first!.id))!, name: 'Locally newer' }, 'bundled');

    const report = await seedBundledDecks(db);
    expect(report.updated).not.toContain(first!.id);
    expect((await getDeck(db, first!.id))?.name).toBe('Locally newer');
  });

  /**
   * The load-bearing guarantee. Seeding runs on every launch and after every
   * app update, and it must never be able to touch a deck the user made.
   */
  it('never touches a custom deck', async () => {
    const mine = {
      schemaVersion: 1,
      id: 'dck_11111111',
      name: 'Inside Jokes',
      description: 'Mine.',
      author: 'will',
      language: 'en',
      accentColor: '#FF3D6E',
      tags: ['private'],
      createdAt: '2026-07-26T18:00:00Z',
      updatedAt: '2026-07-26T18:00:00Z',
      cards: [{ id: 'crd_11111111', text: 'The thing with the boat', note: null }],
    };

    await upsertDeck(db, mine, 'custom');
    await seedBundledDecks(db);
    await seedBundledDecks(db);

    expect(await getDeck(db, mine.id)).toEqual({ ...mine, source: 'custom' });
    expect(await countDecks(db, 'custom')).toBe(1);
  });

  it('leaves a custom deck alone even if it somehow shares a bundled id', async () => {
    const bundledId = (() => {
      const result = validateDeck(bundledDeckDocuments[0]);
      if (!result.ok) throw new Error('invalid deck');
      return result.deck.id;
    })();

    const impostor = {
      schemaVersion: 1,
      id: bundledId,
      name: 'Mine, same id',
      description: '',
      author: 'will',
      language: 'en',
      accentColor: '#FF3D6E',
      tags: [],
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
      cards: [{ id: 'crd_22222222', text: 'Do not overwrite me', note: null }],
    };

    await upsertDeck(db, impostor, 'custom');
    await seedBundledDecks(db);

    const loaded = await getDeck(db, bundledId);
    expect(loaded?.name).toBe('Mine, same id');
    expect(loaded?.source).toBe('custom');
  });

  it('installs the remaining decks if one is malformed', async () => {
    // Guards the failure mode where a bad deck in a future release would
    // otherwise leave the app with no decks at all.
    jest.resetModules();
    jest.doMock('@/decks/bundled', () => ({
      bundledDeckDocuments: [{ schemaVersion: 1, name: 'Broken' }, bundledDeckDocuments[1]],
    }));

    const { seedBundledDecks: seedWithBrokenDeck } = await import('./seed');
    const report = await seedWithBrokenDeck(db);

    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]?.name).toBe('Broken');
    expect(report.inserted).toHaveLength(1);

    jest.dontMock('@/decks/bundled');
    jest.resetModules();
  });
});
