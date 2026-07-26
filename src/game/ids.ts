/**
 * Session and round identifiers.
 *
 * Same shape as deck and card ids, different prefixes. Kept here rather than
 * in /src/decks because these belong to gameplay, not to deck content.
 */

export const SESSION_ID_PREFIX = 'ses_';
export const ROUND_ID_PREFIX = 'rnd_';

export type RandomSource = () => number;

function randomHex(random: RandomSource): string {
  return Math.floor(random() * 0x100000000)
    .toString(16)
    .padStart(8, '0')
    .slice(0, 8);
}

export function makeSessionId(random: RandomSource = Math.random): string {
  return SESSION_ID_PREFIX + randomHex(random);
}

export function makeRoundId(random: RandomSource = Math.random): string {
  return ROUND_ID_PREFIX + randomHex(random);
}
