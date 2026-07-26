import { isCardId, isDeckId } from './ids';
import {
  CARD_TEXT_SOFT_CAP,
  CURRENT_DECK_SCHEMA_VERSION,
  type Card,
  type Deck,
  MIN_PLAYABLE_CARDS,
} from './types';
import { parseHexColor } from '@/ui/contrast';

/**
 * Deck validation.
 *
 * This runs on untrusted input — QR payloads, files, pasted text — so it takes
 * `unknown` and proves the shape rather than trusting a cast. Messages are
 * written for the person doing the import, not for a developer, because they
 * surface directly on the import preview screen.
 *
 * Errors reject the deck. Warnings let it through and are shown alongside the
 * preview, because a deck that is merely awkward is still the user's deck and
 * the spec says nothing they create can be lost.
 */

export type ValidationIssue = {
  /** Dotted path to the offending field, for example `cards[3].text`. */
  path: string;
  message: string;
};

export type ValidationResult =
  | { ok: true; deck: Deck; warnings: ValidationIssue[] }
  | { ok: false; reason: FailureReason; errors: ValidationIssue[]; warnings: ValidationIssue[] };

/**
 * Distinguished so the import screen can explain a future-version deck
 * differently from a corrupt one. One means "update the app", the other means
 * "this file is broken".
 */
export type FailureReason = 'malformed' | 'unsupportedSchemaVersion';

const MAX_NAME_LENGTH = 60;
const MAX_DESCRIPTION_LENGTH = 280;
const MAX_AUTHOR_LENGTH = 40;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 24;
const MAX_NOTE_LENGTH = 140;
/** Guards against a decompression bomb arriving by QR or file in M5. */
const MAX_CARDS = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

/**
 * Validates a parsed deck document.
 *
 * Takes already-parsed JSON rather than a string, so that JSON syntax errors
 * are reported by the caller with the context it has (which file, which QR).
 */
export function validateDeck(input: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const fail = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!isRecord(input)) {
    return {
      ok: false,
      reason: 'malformed',
      errors: [{ path: '', message: 'This file does not contain a deck.' }],
      warnings,
    };
  }

  // Schema version is checked first and on its own. A deck from a future
  // version may legitimately have a shape this build cannot read, so reporting
  // field errors against it would be noise at best and misleading at worst.
  const { schemaVersion } = input;
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion)) {
    return {
      ok: false,
      reason: 'malformed',
      errors: [
        {
          path: 'schemaVersion',
          message: 'This file is missing a deck version, so it cannot be read as a deck.',
        },
      ],
      warnings,
    };
  }
  if (schemaVersion > CURRENT_DECK_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: 'unsupportedSchemaVersion',
      errors: [
        {
          path: 'schemaVersion',
          message: `This deck was made with a newer version of Deckhead (deck version ${schemaVersion}, this app reads up to ${CURRENT_DECK_SCHEMA_VERSION}). Update the app to open it.`,
        },
      ],
      warnings,
    };
  }
  if (schemaVersion < 1) {
    return {
      ok: false,
      reason: 'malformed',
      errors: [{ path: 'schemaVersion', message: 'This deck has an invalid version number.' }],
      warnings,
    };
  }

  const id = typeof input.id === 'string' ? input.id : '';
  if (!id) {
    fail('id', 'This deck has no identifier.');
  } else if (!isDeckId(id)) {
    fail('id', 'This deck has an identifier the app does not recognise.');
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    fail('name', 'A deck needs a name.');
  } else if (name.length > MAX_NAME_LENGTH) {
    fail('name', `Deck names are limited to ${MAX_NAME_LENGTH} characters.`);
  }

  const description = typeof input.description === 'string' ? input.description : '';
  if (input.description !== undefined && typeof input.description !== 'string') {
    fail('description', 'The deck description is not text.');
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    fail('description', `Deck descriptions are limited to ${MAX_DESCRIPTION_LENGTH} characters.`);
  }

  const author = typeof input.author === 'string' ? input.author : '';
  if (input.author !== undefined && typeof input.author !== 'string') {
    fail('author', 'The deck author is not text.');
  } else if (author.length > MAX_AUTHOR_LENGTH) {
    fail('author', `Author names are limited to ${MAX_AUTHOR_LENGTH} characters.`);
  }

  const language = typeof input.language === 'string' && input.language ? input.language : 'en';
  if (input.language !== undefined && typeof input.language !== 'string') {
    fail('language', 'The deck language is not text.');
  }

  const accentColor = typeof input.accentColor === 'string' ? input.accentColor : '';
  if (!accentColor) {
    fail('accentColor', 'This deck has no colour.');
  } else if (!parseHexColor(accentColor)) {
    fail('accentColor', `"${accentColor}" is not a colour the app can read. Use a hex value like #FF3D6E.`);
  }

  let tags: string[] = [];
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.some((t) => typeof t !== 'string')) {
      fail('tags', 'Deck tags are not a list of text.');
    } else {
      tags = (input.tags as string[]).map((t) => t.trim()).filter(Boolean);
      if (tags.length > MAX_TAGS) {
        fail('tags', `Decks are limited to ${MAX_TAGS} tags.`);
      }
      if (tags.some((t) => t.length > MAX_TAG_LENGTH)) {
        fail('tags', `Tags are limited to ${MAX_TAG_LENGTH} characters.`);
      }
    }
  }

  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (!isIsoDate(input[field])) {
      fail(field, 'This deck has an unreadable date.');
    }
  }

  const cards: Card[] = [];
  if (!Array.isArray(input.cards)) {
    fail('cards', 'This deck has no cards list.');
  } else if (input.cards.length > MAX_CARDS) {
    fail('cards', `Decks are limited to ${MAX_CARDS} cards. This one has ${input.cards.length}.`);
  } else {
    const seenCardIds = new Set<string>();

    input.cards.forEach((raw, index) => {
      const path = `cards[${index}]`;
      if (!isRecord(raw)) {
        fail(path, `Card ${index + 1} is not a card.`);
        return;
      }

      const cardId = typeof raw.id === 'string' ? raw.id : '';
      if (!cardId) {
        fail(`${path}.id`, `Card ${index + 1} has no identifier.`);
      } else if (!isCardId(cardId)) {
        fail(`${path}.id`, `Card ${index + 1} has an identifier the app does not recognise.`);
      } else if (seenCardIds.has(cardId)) {
        // Duplicate ids would make seen-card tracking mark two cards at once.
        fail(`${path}.id`, `Two cards share the same identifier (${cardId}).`);
      } else {
        seenCardIds.add(cardId);
      }

      const text = typeof raw.text === 'string' ? raw.text.trim() : '';
      if (typeof raw.text !== 'string') {
        fail(`${path}.text`, `Card ${index + 1} has no text.`);
      } else if (!text) {
        fail(`${path}.text`, `Card ${index + 1} is empty.`);
      } else if (text.length > CARD_TEXT_SOFT_CAP) {
        // Soft cap: allowed, but it will be small on the card.
        warn(
          `${path}.text`,
          `"${text.slice(0, 30)}…" is ${text.length} characters. Anything over ${CARD_TEXT_SOFT_CAP} is hard to read at arm's length.`,
        );
      }

      let note: string | null = null;
      if (raw.note !== undefined && raw.note !== null) {
        if (typeof raw.note !== 'string') {
          fail(`${path}.note`, `The hint on card ${index + 1} is not text.`);
        } else if (raw.note.length > MAX_NOTE_LENGTH) {
          fail(`${path}.note`, `Hints are limited to ${MAX_NOTE_LENGTH} characters.`);
        } else {
          note = raw.note.trim() || null;
        }
      }

      if (cardId && text) {
        cards.push({ id: cardId, text, note });
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, reason: 'malformed', errors, warnings };
  }

  // Not an error. The spec allows a short deck to exist, it just cannot start
  // a round, and the deck browser says so.
  if (cards.length < MIN_PLAYABLE_CARDS) {
    warn(
      'cards',
      `This deck has ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}. It needs ${MIN_PLAYABLE_CARDS} to start a round.`,
    );
  }

  return {
    ok: true,
    warnings,
    deck: {
      schemaVersion,
      id,
      name,
      description,
      author,
      language,
      accentColor,
      tags,
      createdAt: input.createdAt as string,
      updatedAt: input.updatedAt as string,
      cards,
    },
  };
}
