/**
 * Deck interchange format.
 *
 * This is the shape that crosses trust boundaries: bundled JSON, exported
 * files, QR payloads and pasted text. Storage normalises it into tables; see
 * spec/decisions.md for why the two differ.
 */

/** Bumped only for a breaking change to the deck shape. */
export const CURRENT_DECK_SCHEMA_VERSION = 1;

export type Card = {
  id: string;
  text: string;
  /** Clue-giver hint. Shown in the recap only, never on the card itself. */
  note: string | null;
};

export type Deck = {
  schemaVersion: number;
  id: string;
  name: string;
  description: string;
  author: string;
  /** BCP 47 tag. Only 'en' ships in v1, but decks carry it for later. */
  language: string;
  /** Hex colour driving the full-bleed card background. */
  accentColor: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  cards: Card[];
};

/** Where a deck came from. Bundled decks are re-seeded on app update. */
export type DeckSource = 'bundled' | 'custom';

/** A deck as stored, with the fields storage owns rather than the format. */
export type StoredDeck = Deck & {
  source: DeckSource;
};

/** Deck browser row. Avoids loading every card to show a count. */
export type DeckSummary = {
  id: string;
  name: string;
  description: string;
  author: string;
  accentColor: string;
  tags: string[];
  source: DeckSource;
  cardCount: number;
  updatedAt: string;
};

/** Text longer than this still saves, but wrecks legibility at arm's length. */
export const CARD_TEXT_SOFT_CAP = 60;

/** A deck may exist with fewer, it just cannot start a round. */
export const MIN_PLAYABLE_CARDS = 10;

export function isPlayable(deck: Pick<Deck, 'cards'>): boolean {
  return deck.cards.length >= MIN_PLAYABLE_CARDS;
}

export function summaryIsPlayable(summary: Pick<DeckSummary, 'cardCount'>): boolean {
  return summary.cardCount >= MIN_PLAYABLE_CARDS;
}
