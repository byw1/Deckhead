/**
 * Deck and card identifiers.
 *
 * Prefixed hex, matching the spec's dck_7f3a9c21 / crd_a1b2c3d4. Prefixes make
 * a malformed import obvious at a glance and keep log output readable.
 *
 * These are local identifiers in an offline app with no server and no shared
 * namespace. They do not need to be unguessable, only unlikely to collide, and
 * 32 bits is ample for the number of decks a phone will ever hold.
 */

export const DECK_ID_PREFIX = 'dck_';
export const CARD_ID_PREFIX = 'crd_';

const HEX_DIGITS = 8;

/** Injectable so tests can be deterministic. */
export type RandomSource = () => number;

function randomHex(random: RandomSource): string {
  let out = '';
  while (out.length < HEX_DIGITS) {
    out += Math.floor(random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  }
  return out.slice(0, HEX_DIGITS);
}

export function makeDeckId(random: RandomSource = Math.random): string {
  return DECK_ID_PREFIX + randomHex(random);
}

export function makeCardId(random: RandomSource = Math.random): string {
  return CARD_ID_PREFIX + randomHex(random);
}

export function isDeckId(value: string): boolean {
  return new RegExp(`^${DECK_ID_PREFIX}[0-9a-f]{${HEX_DIGITS}}$`).test(value);
}

export function isCardId(value: string): boolean {
  return new RegExp(`^${CARD_ID_PREFIX}[0-9a-f]{${HEX_DIGITS}}$`).test(value);
}
