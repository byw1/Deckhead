import { deflate, inflate } from 'pako';
import { decodeBase64Url, encodeBase64Url, utf8Decode, utf8Encode } from './base64url';
import type { Deck } from './types';
import { validateDeck, type FailureReason, type ValidationIssue } from './validate';

/**
 * Deck sharing.
 *
 * Deck JSON → gzip → base64url. This is the feature the product hangs on: the
 * incumbent technically has custom decks and almost nobody uses them, because
 * sharing one is painful.
 *
 * The payload format carries a version prefix of its own, separate from the
 * deck's schemaVersion. They answer different questions — "can this build read
 * this envelope" versus "can this build read this deck" — and a future change
 * to compression must not be mistaken for a change to the deck shape.
 */

export const PAYLOAD_VERSION = 1;
export const PAYLOAD_PREFIX = `D${PAYLOAD_VERSION}.`;

export const DECK_FILE_EXTENSION = 'deckhead';
export const DECK_LINK_SCHEME = 'deckhead';

/**
 * How much compressed payload goes in a QR code.
 *
 * The spec suggests 1.5KB as the comfortable ceiling, aiming at decks up to
 * about 150 cards. Measured, those two do not agree: card ids are random hex
 * and do not compress, so every card costs about 11 bytes of payload whatever
 * its text, and 1.5KB runs out at 105 cards.
 *
 * Raised to 2.1KB to hit the spec's actual target, because the constraint
 * behind the 1.5KB figure does not apply here. A QR is scanned phone to phone
 * at arm's length off a bright screen, not read across a dim room — that is
 * the card face's problem, not this one. At low error correction a version 40
 * code holds about 2.9KB, so 2.1KB lands near version 34 with real margin.
 *
 * Roughly 160 cards. Bigger decks fall back to a file, and the export screen
 * says so plainly rather than rendering something that will not scan.
 */
export const QR_PAYLOAD_LIMIT = 2100;

/**
 * Low error correction, deliberately.
 *
 * The usual argument for higher levels is print damage and dirt. This code
 * lives on a screen for ten seconds. Spending capacity on recovery would mean
 * a denser code for the same deck, which is the opposite of what helps.
 */
export const QR_ERROR_CORRECTION = 'L' as const;

export function encodeDeck(deck: Deck): string {
  const json = JSON.stringify(deck);
  const compressed = deflate(utf8Encode(json), { level: 9 });
  return PAYLOAD_PREFIX + encodeBase64Url(compressed);
}

export type DecodeResult =
  | { ok: true; deck: Deck; warnings: ValidationIssue[] }
  | { ok: false; reason: DecodeFailure; message: string };

export type DecodeFailure = FailureReason | 'unsupportedPayloadVersion' | 'corrupt';

/**
 * Reverses encodeDeck and validates the result.
 *
 * Every failure is a message a person can act on, because this runs on
 * whatever a QR scanner or a paste box hands it.
 */
export function decodeDeck(payload: string): DecodeResult {
  const trimmed = payload.trim();
  if (!trimmed) {
    return { ok: false, reason: 'corrupt', message: 'There is nothing here to import.' };
  }

  const match = /^D(\d+)\./.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      reason: 'corrupt',
      message: 'This does not look like a Deckhead deck.',
    };
  }

  const version = Number(match[1]);
  if (version > PAYLOAD_VERSION) {
    return {
      ok: false,
      reason: 'unsupportedPayloadVersion',
      message: 'This deck was shared from a newer version of Deckhead. Update the app to open it.',
    };
  }

  const bytes = decodeBase64Url(trimmed.slice(match[0].length));
  if (!bytes || bytes.length === 0) {
    return { ok: false, reason: 'corrupt', message: 'This deck is damaged and cannot be read.' };
  }

  let json: string;
  try {
    json = utf8Decode(inflate(bytes));
  } catch {
    return { ok: false, reason: 'corrupt', message: 'This deck is damaged and cannot be read.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'corrupt', message: 'This deck is damaged and cannot be read.' };
  }

  const result = validateDeck(parsed);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      message: result.errors[0]?.message ?? 'This deck cannot be read.',
    };
  }

  return { ok: true, deck: result.deck, warnings: result.warnings };
}

/** `deckhead://deck?d=<payload>`. */
export function deckLink(deck: Deck): string {
  return `${DECK_LINK_SCHEME}://deck?d=${encodeDeck(deck)}`;
}

/** Pulls a payload out of a deep link, or returns null. */
export function payloadFromLink(url: string): string | null {
  // Restricted to the payload alphabet rather than "anything but & and #".
  // The looser form also matched whitespace, so a link pasted inside a message
  // swallowed the words after it and decoded as damaged.
  const match = /[?&]d=([A-Za-z0-9\-_+/=%.]+)/.exec(url);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

/**
 * Finds a payload in whatever the user pasted.
 *
 * People paste the whole link as often as the payload, and sometimes a whole
 * message with the link in it. Rejecting those would be technically correct
 * and useless.
 */
export function extractPayload(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fromLink = payloadFromLink(trimmed);
  if (fromLink) return fromLink;

  const bare = /D\d+\.[A-Za-z0-9\-_+/=]+/.exec(trimmed);
  return bare ? bare[0] : null;
}

export function fitsInQr(payload: string): boolean {
  return payload.length <= QR_PAYLOAD_LIMIT;
}

/** A filename safe on every platform, derived from the deck name. */
export function deckFileName(deck: Deck): string {
  const base =
    deck.name
      .trim()
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40) || 'deck';

  return `${base}.${DECK_FILE_EXTENSION}`;
}

export type ShareSize = {
  payload: string;
  bytes: number;
  fitsQr: boolean;
  /** Roughly how much smaller the compressed form is, for the export screen. */
  compressionRatio: number;
};

export function measure(deck: Deck): ShareSize {
  const payload = encodeDeck(deck);
  const raw = JSON.stringify(deck).length;

  return {
    payload,
    bytes: payload.length,
    fitsQr: fitsInQr(payload),
    compressionRatio: raw === 0 ? 1 : payload.length / raw,
  };
}
