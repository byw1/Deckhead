import { bundledDeckDocuments } from '@/decks/bundled';
import { validateDeck } from '@/decks/validate';
import { getDeck, upsertDeck } from './deckRepo';
import type { Sql } from './sql';

/**
 * Installs the bundled decks.
 *
 * Runs on every launch, but writes only what changed:
 *
 *   - A bundled deck the device has never seen is inserted.
 *   - A bundled deck whose updatedAt has moved forward in an app update is
 *     rewritten, so content fixes reach existing installs.
 *   - Anything else is left alone.
 *
 * Only rows already marked `bundled` are ever rewritten. A custom deck cannot
 * be touched by seeding, which is what keeps the rule that nothing the user
 * creates can be lost true across updates.
 */

export type SeedReport = {
  inserted: string[];
  updated: string[];
  unchanged: string[];
  /** A bundled deck that failed validation. Should be empty; see seed.test.ts. */
  rejected: { name: string; problems: string[] }[];
};

export async function seedBundledDecks(db: Sql): Promise<SeedReport> {
  const report: SeedReport = { inserted: [], updated: [], unchanged: [], rejected: [] };

  for (const document of bundledDeckDocuments) {
    const result = validateDeck(document);

    if (!result.ok) {
      // A broken bundled deck is a build error, not a user problem. Skip it and
      // let the rest install rather than leaving the app with no decks at all.
      const name =
        typeof document === 'object' && document !== null && 'name' in document
          ? String((document as { name: unknown }).name)
          : 'unknown deck';
      report.rejected.push({ name, problems: result.errors.map((e) => e.message) });
      continue;
    }

    const deck = result.deck;
    const existing = await getDeck(db, deck.id);

    if (!existing) {
      await upsertDeck(db, deck, 'bundled');
      report.inserted.push(deck.id);
      continue;
    }

    // A user who duplicated a bundled deck has a custom deck with a different
    // id, so this only ever matches the bundled original. Guarded anyway.
    if (existing.source !== 'bundled') {
      report.unchanged.push(deck.id);
      continue;
    }

    if (Date.parse(deck.updatedAt) > Date.parse(existing.updatedAt)) {
      await upsertDeck(db, deck, 'bundled');
      report.updated.push(deck.id);
    } else {
      report.unchanged.push(deck.id);
    }
  }

  return report;
}
