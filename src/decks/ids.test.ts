import { CARD_ID_PREFIX, DECK_ID_PREFIX, isCardId, isDeckId, makeCardId, makeDeckId } from './ids';

describe('id generation', () => {
  it('matches the format in the spec', () => {
    expect(makeDeckId()).toMatch(/^dck_[0-9a-f]{8}$/);
    expect(makeCardId()).toMatch(/^crd_[0-9a-f]{8}$/);
  });

  it('pads short random values to full width', () => {
    // Math.random() near zero would otherwise produce a stubby id.
    expect(makeDeckId(() => 0)).toBe(`${DECK_ID_PREFIX}00000000`);
    expect(makeCardId(() => 0)).toBe(`${CARD_ID_PREFIX}00000000`);
  });

  it('stays in range at the top of the random interval', () => {
    // Math.random() never returns 1, but the id must not overflow if it did.
    expect(makeDeckId(() => 0.9999999)).toMatch(/^dck_[0-9a-f]{8}$/);
  });

  it('does not collide across a realistic number of decks', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => makeDeckId()));
    expect(ids.size).toBeGreaterThan(9980);
  });
});

describe('id recognition', () => {
  it('accepts what it generates', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(isDeckId(makeDeckId())).toBe(true);
      expect(isCardId(makeCardId())).toBe(true);
    }
  });

  it('does not confuse a deck id for a card id', () => {
    expect(isCardId(makeDeckId())).toBe(false);
    expect(isDeckId(makeCardId())).toBe(false);
  });

  it.each(['', 'dck_', 'dck_1234567', 'dck_123456789', 'dck_ABCDEF12', 'deck_12345678', '12345678'])(
    'rejects %p as a deck id',
    (value) => {
      expect(isDeckId(value)).toBe(false);
    },
  );

  it('is not fooled by extra content around a valid id', () => {
    expect(isDeckId(' dck_12345678')).toBe(false);
    expect(isDeckId('dck_12345678 ')).toBe(false);
    expect(isDeckId('xdck_12345678')).toBe(false);
    expect(isDeckId('dck_12345678\ndck_87654321')).toBe(false);
  });

  /**
   * In some languages `$` also matches before a trailing newline, which would
   * let a padded id through from a file or QR payload. JavaScript's `$` is a
   * strict end-of-string anchor without the `m` flag. Pinned, because these
   * run on untrusted import input in M5.
   */
  it('rejects a valid id with a trailing newline', () => {
    expect(isDeckId('dck_12345678\n')).toBe(false);
    expect(isCardId('crd_12345678\n')).toBe(false);
  });
});
