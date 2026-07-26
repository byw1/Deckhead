import { makeCardId, makeDeckId } from './ids';
import { CARD_TEXT_SOFT_CAP, CURRENT_DECK_SCHEMA_VERSION, MIN_PLAYABLE_CARDS } from './types';
import { validateDeck, type ValidationResult } from './validate';

function card(text: string, extra: Record<string, unknown> = {}) {
  return { id: makeCardId(), text, note: null, ...extra };
}

function validDeck(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: CURRENT_DECK_SCHEMA_VERSION,
    id: makeDeckId(),
    name: '2000s Emo Bands',
    description: 'For people who owned a studded belt.',
    author: 'will',
    language: 'en',
    accentColor: '#FF3D6E',
    tags: ['music', 'nostalgia'],
    createdAt: '2026-07-26T18:00:00Z',
    updatedAt: '2026-07-26T18:00:00Z',
    cards: Array.from({ length: MIN_PLAYABLE_CARDS }, (_, i) => card(`Band ${i + 1}`)),
    ...overrides,
  };
}

function expectOk(result: ValidationResult) {
  if (!result.ok) {
    throw new Error(`expected valid, got: ${result.errors.map((e) => e.message).join('; ')}`);
  }
  return result;
}

function expectFail(result: ValidationResult) {
  if (result.ok) throw new Error('expected invalid, got a valid deck');
  return result;
}

describe('validateDeck', () => {
  it('accepts the deck shape from the spec', () => {
    const { deck, warnings } = expectOk(validateDeck(validDeck()));
    expect(deck.name).toBe('2000s Emo Bands');
    expect(deck.cards).toHaveLength(MIN_PLAYABLE_CARDS);
    expect(warnings).toEqual([]);
  });

  it.each([null, undefined, 42, 'a deck', [], true])('rejects %p as not a deck', (input) => {
    expect(expectFail(validateDeck(input)).reason).toBe('malformed');
  });
});

describe('schema version', () => {
  it('rejects a deck with no version', () => {
    const { schemaVersion, ...rest } = validDeck();
    void schemaVersion;
    const result = expectFail(validateDeck(rest));
    expect(result.reason).toBe('malformed');
    expect(result.errors[0]?.path).toBe('schemaVersion');
  });

  it('rejects a future version with a message telling the user to update', () => {
    const result = expectFail(
      validateDeck(validDeck({ schemaVersion: CURRENT_DECK_SCHEMA_VERSION + 1 })),
    );
    expect(result.reason).toBe('unsupportedSchemaVersion');
    expect(result.errors[0]?.message).toMatch(/newer version of Deckhead/);
    expect(result.errors[0]?.message).toMatch(/Update the app/);
  });

  it('does not report field errors on a future-version deck', () => {
    // The shape may legitimately differ, so complaining about fields would be
    // misleading. One clear message, nothing else.
    const result = expectFail(
      validateDeck({ schemaVersion: 99, id: 'nonsense', name: '', cards: 'not a list' }),
    );
    expect(result.reason).toBe('unsupportedSchemaVersion');
    expect(result.errors).toHaveLength(1);
  });

  it.each([0, -1, 1.5, '1', null])('rejects %p as a version', (schemaVersion) => {
    expect(expectFail(validateDeck(validDeck({ schemaVersion }))).reason).toBe('malformed');
  });

  it('does not crash on any of these', () => {
    for (const input of [{}, { schemaVersion: 1 }, { schemaVersion: 1, cards: [null] }]) {
      expect(() => validateDeck(input)).not.toThrow();
    }
  });
});

describe('identifiers', () => {
  it('rejects a deck id that is not in the app format', () => {
    const result = expectFail(validateDeck(validDeck({ id: 'deck-1' })));
    expect(result.errors.some((e) => e.path === 'id')).toBe(true);
  });

  it('rejects a card id that is not in the app format', () => {
    const cards = [...validDeck().cards];
    cards[0] = { id: 'card-1', text: 'Taking Back Sunday', note: null };
    expect(expectFail(validateDeck(validDeck({ cards }))).errors[0]?.path).toBe('cards[0].id');
  });

  /**
   * Seen-card tracking is keyed on card id, so two cards sharing one would be
   * marked seen together and the round would silently skip a card.
   */
  it('rejects duplicate card ids within a deck', () => {
    const shared = makeCardId();
    const cards = [
      { id: shared, text: 'Brand New', note: null },
      { id: shared, text: 'Jimmy Eat World', note: null },
    ];
    const result = expectFail(validateDeck(validDeck({ cards })));
    expect(result.errors.some((e) => e.message.includes('share the same identifier'))).toBe(true);
  });
});

describe('cards', () => {
  it('warns rather than fails on a short deck, because a short deck may exist', () => {
    const cards = [card('Dashboard Confessional')];
    const { deck, warnings } = expectOk(validateDeck(validDeck({ cards })));
    expect(deck.cards).toHaveLength(1);
    expect(warnings.some((w) => w.message.includes(`needs ${MIN_PLAYABLE_CARDS}`))).toBe(true);
  });

  it('pluralises the short-deck warning', () => {
    const one = expectOk(validateDeck(validDeck({ cards: [card('Thursday')] })));
    expect(one.warnings[0]?.message).toContain('1 card.');

    const two = expectOk(validateDeck(validDeck({ cards: [card('Thursday'), card('Saves')] })));
    expect(two.warnings[0]?.message).toContain('2 cards.');
  });

  it('warns but accepts text over the soft cap', () => {
    const long = 'A'.repeat(CARD_TEXT_SOFT_CAP + 1);
    const cards = [...validDeck().cards];
    cards[0] = card(long);
    const { deck, warnings } = expectOk(validateDeck(validDeck({ cards })));
    expect(deck.cards[0]?.text).toBe(long);
    expect(warnings.some((w) => w.message.includes("arm's length"))).toBe(true);
  });

  it('does not warn at exactly the soft cap', () => {
    const cards = [...validDeck().cards];
    cards[0] = card('A'.repeat(CARD_TEXT_SOFT_CAP));
    expect(expectOk(validateDeck(validDeck({ cards }))).warnings).toEqual([]);
  });

  it('rejects an empty or whitespace-only card', () => {
    for (const text of ['', '   ']) {
      const cards = [...validDeck().cards];
      cards[0] = card(text);
      expect(expectFail(validateDeck(validDeck({ cards }))).errors[0]?.path).toBe('cards[0].text');
    }
  });

  it('trims card text', () => {
    const cards = [...validDeck().cards];
    cards[0] = card('  My Chemical Romance  ');
    expect(expectOk(validateDeck(validDeck({ cards }))).deck.cards[0]?.text).toBe(
      'My Chemical Romance',
    );
  });

  it('rejects a cards field that is not a list', () => {
    expect(expectFail(validateDeck(validDeck({ cards: 'lots' }))).errors[0]?.path).toBe('cards');
  });

  it('rejects an oversized deck rather than trying to store it', () => {
    const cards = Array.from({ length: 2001 }, (_, i) => card(`Card ${i}`));
    expect(expectFail(validateDeck(validDeck({ cards }))).errors[0]?.path).toBe('cards');
  });

  it('reports the card number a person would count, not the index', () => {
    const cards = [...validDeck().cards];
    cards[2] = card('');
    const result = expectFail(validateDeck(validDeck({ cards })));
    expect(result.errors[0]?.message).toContain('Card 3');
  });
});

describe('notes', () => {
  it('accepts a missing, null or present note', () => {
    const cards = [
      { id: makeCardId(), text: 'Paramore' },
      { id: makeCardId(), text: 'Fall Out Boy', note: null },
      { id: makeCardId(), text: 'Panic! at the Disco', note: 'The one with the exclamation mark' },
    ];
    const { deck } = expectOk(validateDeck(validDeck({ cards })));
    expect(deck.cards.map((c) => c.note)).toEqual([
      null,
      null,
      'The one with the exclamation mark',
    ]);
  });

  it('normalises a whitespace-only note to null', () => {
    const cards = [card('Taking Back Sunday', { note: '   ' })];
    expect(expectOk(validateDeck(validDeck({ cards }))).deck.cards[0]?.note).toBeNull();
  });

  it('rejects a note that is not text', () => {
    const cards = [card('Thrice', { note: 12 })];
    expect(expectFail(validateDeck(validDeck({ cards })))).toBeTruthy();
  });
});

describe('accent colour', () => {
  it.each(['#FF3D6E', '#ff3d6e', '#f0a'])('accepts %s', (accentColor) => {
    expect(expectOk(validateDeck(validDeck({ accentColor })))).toBeTruthy();
  });

  it.each(['FF3D6E', 'hotpink', '#GGGGGG', ''])('rejects %p', (accentColor) => {
    const result = expectFail(validateDeck(validDeck({ accentColor })));
    expect(result.errors.some((e) => e.path === 'accentColor')).toBe(true);
  });

  it('names the bad value in the message so the user can find it', () => {
    const result = expectFail(validateDeck(validDeck({ accentColor: 'hotpink' })));
    expect(result.errors.find((e) => e.path === 'accentColor')?.message).toContain('hotpink');
  });
});

describe('metadata', () => {
  it('requires a name', () => {
    for (const name of ['', '   ', undefined, 42]) {
      expect(expectFail(validateDeck(validDeck({ name }))).errors.some((e) => e.path === 'name')).toBe(
        true,
      );
    }
  });

  it('trims the name', () => {
    expect(expectOk(validateDeck(validDeck({ name: '  Emo  ' }))).deck.name).toBe('Emo');
  });

  it('defaults a missing language to en', () => {
    const { language, ...rest } = validDeck();
    void language;
    expect(expectOk(validateDeck(rest)).deck.language).toBe('en');
  });

  it('defaults missing description, author and tags to empty', () => {
    const { description, author, tags, ...rest } = validDeck();
    void description;
    void author;
    void tags;
    const { deck } = expectOk(validateDeck(rest));
    expect(deck.description).toBe('');
    expect(deck.author).toBe('');
    expect(deck.tags).toEqual([]);
  });

  it('drops blank tags and trims the rest', () => {
    expect(expectOk(validateDeck(validDeck({ tags: [' music ', '', '  '] }))).deck.tags).toEqual([
      'music',
    ]);
  });

  it.each(['createdAt', 'updatedAt'])('rejects an unreadable %s', (field) => {
    const result = expectFail(validateDeck(validDeck({ [field]: 'last tuesday' })));
    expect(result.errors.some((e) => e.path === field)).toBe(true);
  });

  it('rejects a date that is not ISO 8601, even if Date.parse accepts it', () => {
    expect(expectFail(validateDeck(validDeck({ createdAt: '2026/07/26' })))).toBeTruthy();
  });
});

describe('error reporting', () => {
  it('collects every problem rather than stopping at the first', () => {
    const result = expectFail(
      validateDeck(validDeck({ name: '', accentColor: 'nope', createdAt: 'whenever' })),
    );
    expect(result.errors.map((e) => e.path).sort()).toEqual(['accentColor', 'createdAt', 'name']);
  });

  it('writes messages for a person, not a developer', () => {
    const result = expectFail(validateDeck(validDeck({ name: '' })));
    for (const error of result.errors) {
      expect(error.message).toMatch(/^[A-Z"]/);
      expect(error.message).toMatch(/[.!]$/);
      expect(error.message).not.toMatch(/undefined|null|typeof|Object|Array/);
    }
  });
});
