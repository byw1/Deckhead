import { makeCardId, makeDeckId, type RandomSource } from './ids';
import { CARD_TEXT_SOFT_CAP, CURRENT_DECK_SCHEMA_VERSION, type Card, type Deck } from './types';

/**
 * Deck editing.
 *
 * Pure functions over a deck: every one returns a new deck and leaves the
 * original alone, so the editor can hold a draft, compare it against what is
 * stored, and discard without side effects.
 *
 * Card ids are stable across every operation here except duplicate. Seen-card
 * tracking depends on them, so editing a card's text must not change its
 * identity.
 */

export type NewDeckInput = {
  name?: string;
  description?: string;
  author?: string;
  accentColor?: string;
  now: string;
  random?: RandomSource;
};

export const DEFAULT_ACCENT = '#FF3D6E';

export function createDeck(input: NewDeckInput): Deck {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    id: makeDeckId(input.random),
    name: input.name ?? '',
    description: input.description ?? '',
    author: input.author ?? '',
    language: 'en',
    accentColor: input.accentColor ?? DEFAULT_ACCENT,
    tags: [],
    createdAt: input.now,
    updatedAt: input.now,
    cards: [],
  };
}

/** Stamps updatedAt. Every mutation below goes through this. */
function touch(deck: Deck, now: string): Deck {
  return { ...deck, updatedAt: now };
}

export function setDeckFields(
  deck: Deck,
  fields: Partial<Pick<Deck, 'name' | 'description' | 'author' | 'accentColor' | 'tags'>>,
  now: string,
): Deck {
  return touch({ ...deck, ...fields }, now);
}

export function addCard(deck: Deck, text: string, now: string, random?: RandomSource): Deck {
  const trimmed = text.trim();
  if (!trimmed) return deck;

  return touch({ ...deck, cards: [...deck.cards, { id: makeCardId(random), text: trimmed, note: null }] }, now);
}

/** Edits text or note in place. The card id is untouched, deliberately. */
export function updateCard(
  deck: Deck,
  cardId: string,
  fields: { text?: string; note?: string | null },
  now: string,
): Deck {
  let changed = false;

  const cards = deck.cards.map((card) => {
    if (card.id !== cardId) return card;
    changed = true;

    const text = fields.text === undefined ? card.text : fields.text.trim();
    const note =
      fields.note === undefined ? card.note : fields.note === null ? null : fields.note.trim() || null;

    return { ...card, text, note };
  });

  return changed ? touch({ ...deck, cards }, now) : deck;
}

export function removeCard(deck: Deck, cardId: string, now: string): Deck {
  const cards = deck.cards.filter((card) => card.id !== cardId);
  return cards.length === deck.cards.length ? deck : touch({ ...deck, cards }, now);
}

/** Moves a card to a new index, clamping rather than failing on out of range. */
export function moveCard(deck: Deck, from: number, to: number, now: string): Deck {
  if (from < 0 || from >= deck.cards.length) return deck;

  const target = Math.min(deck.cards.length - 1, Math.max(0, to));
  if (target === from) return deck;

  const cards = [...deck.cards];
  const [moved] = cards.splice(from, 1);
  cards.splice(target, 0, moved!);

  return touch({ ...deck, cards }, now);
}

export function moveCardUp(deck: Deck, cardId: string, now: string): Deck {
  const index = deck.cards.findIndex((c) => c.id === cardId);
  return index <= 0 ? deck : moveCard(deck, index, index - 1, now);
}

export function moveCardDown(deck: Deck, cardId: string, now: string): Deck {
  const index = deck.cards.findIndex((c) => c.id === cardId);
  return index === -1 || index === deck.cards.length - 1 ? deck : moveCard(deck, index, index + 1, now);
}

export type BulkPasteResult = {
  cards: Card[];
  /** Lines that matched a card already in the deck, or an earlier line. */
  duplicates: string[];
  /** Lines over the legibility soft cap. Added anyway. */
  overLength: string[];
};

/**
 * Turns pasted text into cards, one per line.
 *
 * This is the feature that makes a custom deck worth building: people arrive
 * with a list in Notes or a group chat, not with the patience to tap Add fifty
 * times.
 *
 * A line may carry a clue-giver hint after a pipe, "Card text | hint", because
 * that is the only way to get notes in without a second pass. Everything else
 * is treated as literal text, including commas and dashes, which show up in
 * real card content far too often to use as separators.
 */
export function parseBulkPaste(
  text: string,
  existing: readonly Card[] = [],
  random?: RandomSource,
): BulkPasteResult {
  const seen = new Set(existing.map((card) => card.text.trim().toLocaleLowerCase()));

  const cards: Card[] = [];
  const duplicates: string[] = [];
  const overLength: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const pipe = line.indexOf('|');
    const cardText = (pipe === -1 ? line : line.slice(0, pipe)).trim();
    const note = pipe === -1 ? null : line.slice(pipe + 1).trim() || null;

    if (!cardText) continue;

    const key = cardText.toLocaleLowerCase();
    if (seen.has(key)) {
      duplicates.push(cardText);
      continue;
    }
    seen.add(key);

    if (cardText.length > CARD_TEXT_SOFT_CAP) overLength.push(cardText);

    cards.push({ id: makeCardId(random), text: cardText, note });
  }

  return { cards, duplicates, overLength };
}

export function appendCards(deck: Deck, cards: readonly Card[], now: string): Deck {
  return cards.length === 0 ? deck : touch({ ...deck, cards: [...deck.cards, ...cards] }, now);
}

/**
 * Copies a deck under a new identity.
 *
 * Card ids are regenerated, which is the one place that is correct. The spec
 * says a card id is never regenerated on edit, and this is not an edit — it is
 * a new deck. Keeping the ids would make the copy and the original share
 * seen-card tracking, so a session holding both would silently skip cards.
 */
export function duplicateDeck(deck: Deck, now: string, random?: RandomSource): Deck {
  return {
    ...deck,
    id: makeDeckId(random),
    name: nextCopyName(deck.name),
    cards: deck.cards.map((card) => ({ ...card, id: makeCardId(random) })),
    createdAt: now,
    updatedAt: now,
  };
}

/** "Animals" becomes "Animals copy", then "Animals copy 2". */
export function nextCopyName(name: string): string {
  const match = /^(.*?) copy(?: (\d+))?$/.exec(name.trim());
  if (!match) return `${name.trim()} copy`;

  const base = match[1]!;
  const n = match[2] ? Number(match[2]) : 1;
  return `${base} copy ${n + 1}`;
}

/** Whether a draft differs from what was loaded, for the unsaved-changes prompt. */
export function hasChanges(original: Deck, draft: Deck): boolean {
  if (
    original.name !== draft.name ||
    original.description !== draft.description ||
    original.author !== draft.author ||
    original.accentColor !== draft.accentColor
  ) {
    return true;
  }

  if (original.cards.length !== draft.cards.length) return true;

  return original.cards.some((card, i) => {
    const other = draft.cards[i];
    return !other || other.id !== card.id || other.text !== card.text || other.note !== card.note;
  });
}
