import {
  addCard,
  appendCards,
  createDeck,
  duplicateDeck,
  hasChanges,
  moveCard,
  moveCardDown,
  moveCardUp,
  nextCopyName,
  parseBulkPaste,
  removeCard,
  setDeckFields,
  updateCard,
} from './edit';
import { isCardId, isDeckId } from './ids';
import { CARD_TEXT_SOFT_CAP, type Deck } from './types';
import { validateDeck } from './validate';

const NOW = '2026-07-26T18:00:00Z';
const LATER = '2026-07-27T09:00:00Z';

function deckWith(texts: string[]): Deck {
  return texts.reduce((deck, text) => addCard(deck, text, NOW), createDeck({ now: NOW, name: 'Test' }));
}

describe('creating a deck', () => {
  it('produces a deck the validator accepts once named', () => {
    const deck = createDeck({ now: NOW, name: 'Inside Jokes' });
    const result = validateDeck(deck);
    expect(result.ok).toBe(true);
  });

  it('mints a well-formed id', () => {
    expect(isDeckId(createDeck({ now: NOW }).id)).toBe(true);
  });

  it('starts empty with the brand accent', () => {
    const deck = createDeck({ now: NOW });
    expect(deck.cards).toEqual([]);
    expect(deck.accentColor).toBe('#FF3D6E');
  });

  it('gives each new deck a distinct id', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createDeck({ now: NOW }).id));
    expect(ids.size).toBeGreaterThan(495);
  });
});

describe('adding cards', () => {
  it('appends in order', () => {
    expect(deckWith(['One', 'Two', 'Three']).cards.map((c) => c.text)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  it('mints a well-formed card id', () => {
    expect(deckWith(['One']).cards.every((c) => isCardId(c.id))).toBe(true);
  });

  it('trims and ignores blank text', () => {
    const deck = addCard(addCard(createDeck({ now: NOW }), '  Spaced  ', NOW), '   ', NOW);
    expect(deck.cards.map((c) => c.text)).toEqual(['Spaced']);
  });

  it('stamps updatedAt', () => {
    expect(addCard(createDeck({ now: NOW }), 'One', LATER).updatedAt).toBe(LATER);
  });
});

describe('editing a card', () => {
  /** Seen-card tracking depends on the id, so editing text must not change it. */
  it('keeps the card id when the text changes', () => {
    const deck = deckWith(['Original']);
    const id = deck.cards[0]!.id;

    const edited = updateCard(deck, id, { text: 'Corrected' }, LATER);
    expect(edited.cards[0]?.id).toBe(id);
    expect(edited.cards[0]?.text).toBe('Corrected');
  });

  it('sets and clears a note', () => {
    const deck = deckWith(['One']);
    const id = deck.cards[0]!.id;

    expect(updateCard(deck, id, { note: 'a hint' }, LATER).cards[0]?.note).toBe('a hint');
    expect(updateCard(deck, id, { note: null }, LATER).cards[0]?.note).toBeNull();
    expect(updateCard(deck, id, { note: '   ' }, LATER).cards[0]?.note).toBeNull();
  });

  it('leaves other cards alone', () => {
    const deck = deckWith(['One', 'Two']);
    const edited = updateCard(deck, deck.cards[0]!.id, { text: 'Changed' }, LATER);
    expect(edited.cards[1]).toEqual(deck.cards[1]);
  });

  it('is a no-op for an unknown card, without stamping updatedAt', () => {
    const deck = deckWith(['One']);
    expect(updateCard(deck, 'crd_missing', { text: 'x' }, LATER)).toBe(deck);
  });

  it('does not mutate the original', () => {
    const deck = deckWith(['One']);
    updateCard(deck, deck.cards[0]!.id, { text: 'Changed' }, LATER);
    expect(deck.cards[0]?.text).toBe('One');
  });
});

describe('removing cards', () => {
  it('drops the right one', () => {
    const deck = deckWith(['One', 'Two', 'Three']);
    const after = removeCard(deck, deck.cards[1]!.id, LATER);
    expect(after.cards.map((c) => c.text)).toEqual(['One', 'Three']);
  });

  it('is a no-op for an unknown card', () => {
    const deck = deckWith(['One']);
    expect(removeCard(deck, 'crd_missing', LATER)).toBe(deck);
  });
});

describe('reordering', () => {
  it('moves a card to a new index', () => {
    const deck = deckWith(['A', 'B', 'C', 'D']);
    expect(moveCard(deck, 0, 2, LATER).cards.map((c) => c.text)).toEqual(['B', 'C', 'A', 'D']);
    expect(moveCard(deck, 3, 0, LATER).cards.map((c) => c.text)).toEqual(['D', 'A', 'B', 'C']);
  });

  it('clamps an out-of-range target rather than failing', () => {
    const deck = deckWith(['A', 'B', 'C']);
    expect(moveCard(deck, 0, 99, LATER).cards.map((c) => c.text)).toEqual(['B', 'C', 'A']);
    expect(moveCard(deck, 2, -5, LATER).cards.map((c) => c.text)).toEqual(['C', 'A', 'B']);
  });

  it('ignores an out-of-range source', () => {
    const deck = deckWith(['A']);
    expect(moveCard(deck, 5, 0, LATER)).toBe(deck);
  });

  it('is a no-op when nothing moves', () => {
    const deck = deckWith(['A', 'B']);
    expect(moveCard(deck, 1, 1, LATER)).toBe(deck);
  });

  it('moves up and down by card id', () => {
    const deck = deckWith(['A', 'B', 'C']);
    const b = deck.cards[1]!.id;

    expect(moveCardUp(deck, b, LATER).cards.map((c) => c.text)).toEqual(['B', 'A', 'C']);
    expect(moveCardDown(deck, b, LATER).cards.map((c) => c.text)).toEqual(['A', 'C', 'B']);
  });

  it('does nothing at the ends', () => {
    const deck = deckWith(['A', 'B']);
    expect(moveCardUp(deck, deck.cards[0]!.id, LATER)).toBe(deck);
    expect(moveCardDown(deck, deck.cards[1]!.id, LATER)).toBe(deck);
  });

  it('preserves card ids, so reordering does not reset seen tracking', () => {
    const deck = deckWith(['A', 'B', 'C']);
    const before = new Set(deck.cards.map((c) => c.id));
    const after = moveCard(deck, 0, 2, LATER);
    expect(new Set(after.cards.map((c) => c.id))).toEqual(before);
  });
});

describe('bulk paste', () => {
  it('takes one card per line', () => {
    const { cards } = parseBulkPaste('One\nTwo\nThree');
    expect(cards.map((c) => c.text)).toEqual(['One', 'Two', 'Three']);
  });

  it('trims and skips blank lines', () => {
    const { cards } = parseBulkPaste('  One  \n\n   \nTwo\n');
    expect(cards.map((c) => c.text)).toEqual(['One', 'Two']);
  });

  it('handles Windows line endings', () => {
    expect(parseBulkPaste('One\r\nTwo').cards.map((c) => c.text)).toEqual(['One', 'Two']);
  });

  it('reads a hint after a pipe', () => {
    const { cards } = parseBulkPaste('Panic! at the Disco | the one with the exclamation mark');
    expect(cards[0]?.text).toBe('Panic! at the Disco');
    expect(cards[0]?.note).toBe('the one with the exclamation mark');
  });

  /** Commas and dashes appear in real card text far too often to be separators. */
  it('treats commas and dashes as literal text', () => {
    const { cards } = parseBulkPaste('Earth, Wind & Fire\nSpider-Man');
    expect(cards.map((c) => c.text)).toEqual(['Earth, Wind & Fire', 'Spider-Man']);
  });

  it('drops a line that is only a pipe', () => {
    expect(parseBulkPaste('|\n| just a hint').cards).toEqual([]);
  });

  it('reports duplicates within the paste rather than adding them twice', () => {
    const { cards, duplicates } = parseBulkPaste('One\nTwo\nOne');
    expect(cards.map((c) => c.text)).toEqual(['One', 'Two']);
    expect(duplicates).toEqual(['One']);
  });

  it('reports duplicates against cards already in the deck', () => {
    const deck = deckWith(['One']);
    const { cards, duplicates } = parseBulkPaste('One\nTwo', deck.cards);
    expect(cards.map((c) => c.text)).toEqual(['Two']);
    expect(duplicates).toEqual(['One']);
  });

  it('matches duplicates case insensitively', () => {
    const deck = deckWith(['My Chemical Romance']);
    expect(parseBulkPaste('MY CHEMICAL ROMANCE', deck.cards).cards).toEqual([]);
  });

  it('flags over-length lines but still adds them', () => {
    const long = 'A'.repeat(CARD_TEXT_SOFT_CAP + 1);
    const { cards, overLength } = parseBulkPaste(long);
    expect(cards).toHaveLength(1);
    expect(overLength).toEqual([long]);
  });

  it('gives every pasted card a distinct id', () => {
    const { cards } = parseBulkPaste(Array.from({ length: 200 }, (_, i) => `Card ${i}`).join('\n'));
    expect(new Set(cards.map((c) => c.id)).size).toBe(200);
  });

  it('handles an empty paste', () => {
    expect(parseBulkPaste('').cards).toEqual([]);
    expect(parseBulkPaste('   \n  ').cards).toEqual([]);
  });

  it('appends onto a deck', () => {
    const deck = deckWith(['One']);
    const { cards } = parseBulkPaste('Two\nThree', deck.cards);
    expect(appendCards(deck, cards, LATER).cards.map((c) => c.text)).toEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  it('appending nothing is a no-op', () => {
    const deck = deckWith(['One']);
    expect(appendCards(deck, [], LATER)).toBe(deck);
  });
});

describe('duplicating a deck', () => {
  /**
   * The one place regenerating card ids is right. A copy sharing ids with its
   * original would make a session containing both mark each other's cards as
   * seen, and the round would silently skip cards.
   */
  it('gives the copy new card ids', () => {
    const deck = deckWith(['One', 'Two']);
    const copy = duplicateDeck(deck, LATER);

    expect(copy.id).not.toBe(deck.id);
    for (const [i, card] of copy.cards.entries()) {
      expect(card.id).not.toBe(deck.cards[i]!.id);
      expect(isCardId(card.id)).toBe(true);
    }
  });

  it('keeps the content identical', () => {
    const deck = setDeckFields(deckWith(['One', 'Two']), { description: 'Mine' }, NOW);
    const copy = duplicateDeck(deck, LATER);

    expect(copy.cards.map((c) => c.text)).toEqual(deck.cards.map((c) => c.text));
    expect(copy.description).toBe('Mine');
    expect(copy.accentColor).toBe(deck.accentColor);
  });

  it('names the copy so it is distinguishable in the list', () => {
    expect(duplicateDeck(deckWith([]), LATER).name).toBe('Test copy');
  });

  it('numbers repeated copies', () => {
    expect(nextCopyName('Animals')).toBe('Animals copy');
    expect(nextCopyName('Animals copy')).toBe('Animals copy 2');
    expect(nextCopyName('Animals copy 2')).toBe('Animals copy 3');
    expect(nextCopyName('Animals copy 9')).toBe('Animals copy 10');
  });

  it('does not treat a deck genuinely called something-copy-ish as a copy', () => {
    expect(nextCopyName('Photocopy')).toBe('Photocopy copy');
  });

  it('resets the timestamps', () => {
    const copy = duplicateDeck(deckWith(['One']), LATER);
    expect(copy.createdAt).toBe(LATER);
    expect(copy.updatedAt).toBe(LATER);
  });

  it('produces a deck the validator accepts', () => {
    expect(validateDeck(duplicateDeck(deckWith(['One']), LATER)).ok).toBe(true);
  });

  it('does not mutate the original', () => {
    const deck = deckWith(['One']);
    const originalId = deck.cards[0]!.id;
    duplicateDeck(deck, LATER);
    expect(deck.cards[0]?.id).toBe(originalId);
  });
});

describe('unsaved changes', () => {
  it('sees no change in an untouched draft', () => {
    const deck = deckWith(['One']);
    expect(hasChanges(deck, deck)).toBe(false);
    expect(hasChanges(deck, { ...deck, cards: [...deck.cards] })).toBe(false);
  });

  it.each([
    ['name', (d: Deck) => setDeckFields(d, { name: 'Renamed' }, LATER)],
    ['description', (d: Deck) => setDeckFields(d, { description: 'New' }, LATER)],
    ['accent colour', (d: Deck) => setDeckFields(d, { accentColor: '#2BD576' }, LATER)],
    ['card text', (d: Deck) => updateCard(d, d.cards[0]!.id, { text: 'Changed' }, LATER)],
    ['card order', (d: Deck) => moveCard(d, 0, 1, LATER)],
    ['an added card', (d: Deck) => addCard(d, 'Three', LATER)],
    ['a removed card', (d: Deck) => removeCard(d, d.cards[0]!.id, LATER)],
  ])('detects a change to %s', (_label, change) => {
    const deck = deckWith(['One', 'Two']);
    expect(hasChanges(deck, change(deck))).toBe(true);
  });

  it('ignores updatedAt on its own', () => {
    const deck = deckWith(['One']);
    expect(hasChanges(deck, { ...deck, updatedAt: LATER })).toBe(false);
  });
});
