import { act, renderHook, waitFor } from '@testing-library/react-native';
import { addCard, createDeck } from '@/decks/edit';
import { encodeDeck } from '@/decks/share';
import type { Deck } from '@/decks/types';
import { getDeck, upsertDeck } from '@/storage/deckRepo';
import { migrate } from '@/storage/migrations';
import { createTestDriver, type TestDriver } from '@/storage/testDriver';
import { useDeckImport } from './useDeckImport';

/**
 * Import is the path where a mistake costs someone their deck, so this covers
 * the guarantees rather than the plumbing: nothing is written before a confirm
 * tap, and a collision never overwrites without being asked.
 */

const NOW = '2026-07-26T18:00:00Z';

function deckOf(count: number, name = 'Shared Deck'): Deck {
  return Array.from({ length: count }, (_, i) => `Card ${i}`).reduce(
    (deck, text) => addCard(deck, text, NOW),
    createDeck({ now: NOW, name }),
  );
}

let db: TestDriver;

beforeEach(async () => {
  db = createTestDriver();
  await migrate(db);
});

afterEach(() => db.close());

describe('previewing', () => {
  it('shows the deck without writing anything', async () => {
    const deck = deckOf(12);
    const { result } = renderHook(() => useDeckImport());

    await act(async () => {
      await result.current.offer(encodeDeck(deck), db);
    });

    expect(result.current.state).toMatchObject({
      status: 'preview',
      collides: false,
      deck: { name: 'Shared Deck' },
    });

    // The load-bearing part: still nothing on disk.
    expect(await getDeck(db, deck.id)).toBeNull();
  });

  it('passes warnings through for a deck too short to play', async () => {
    const { result } = renderHook(() => useDeckImport());

    await act(async () => {
      await result.current.offer(encodeDeck(deckOf(3)), db);
    });

    expect(result.current.state.status).toBe('preview');
    expect(
      result.current.state.status === 'preview' && result.current.state.warnings.length,
    ).toBeGreaterThan(0);
  });

  it('reports a damaged payload rather than throwing', async () => {
    const { result } = renderHook(() => useDeckImport());

    await act(async () => {
      await result.current.offer('D1.notarealpayload', db);
    });

    expect(result.current.state.status).toBe('error');
  });

  it('reports something that is not a deck at all', async () => {
    const { result } = renderHook(() => useDeckImport());

    await act(async () => {
      await result.current.offer('just some text', db);
    });

    expect(result.current.state).toMatchObject({ status: 'error', reason: 'corrupt' });
  });
});

describe('adding a new deck', () => {
  it('writes only after a confirm', async () => {
    const deck = deckOf(12);
    const { result } = renderHook(() => useDeckImport());

    await act(async () => {
      await result.current.offer(encodeDeck(deck), db);
    });
    await act(async () => {
      await result.current.confirmAdd(db);
    });

    await waitFor(() => expect(result.current.state.status).toBe('done'));

    const stored = await getDeck(db, deck.id);
    expect(stored?.name).toBe('Shared Deck');
    expect(stored?.source).toBe('custom');
    expect(stored?.cards).toHaveLength(12);
  });

  it('lands as a custom deck, not a bundled one', async () => {
    const deck = deckOf(12);
    const { result } = renderHook(() => useDeckImport());

    await act(async () => {
      await result.current.offer(encodeDeck(deck), db);
    });
    await act(async () => {
      await result.current.confirmAdd(db);
    });

    expect((await getDeck(db, deck.id))?.source).toBe('custom');
  });
});

describe('collisions', () => {
  /** Never overwrite without asking. */
  it('flags a deck whose id is already here', async () => {
    const mine = deckOf(12, 'Mine');
    await upsertDeck(db, mine, 'custom');

    const theirs = { ...mine, name: 'Theirs' };
    const { result } = renderHook(() => useDeckImport());

    await act(async () => {
      await result.current.offer(encodeDeck(theirs), db);
    });

    expect(result.current.state).toMatchObject({ status: 'preview', collides: true });
    expect((await getDeck(db, mine.id))?.name).toBe('Mine');
  });

  it('refuses a plain add when it would collide', async () => {
    const mine = deckOf(12, 'Mine');
    await upsertDeck(db, mine, 'custom');

    const { result } = renderHook(() => useDeckImport());
    await act(async () => {
      await result.current.offer(encodeDeck({ ...mine, name: 'Theirs' }), db);
    });
    await act(async () => {
      await result.current.confirmAdd(db);
    });

    expect(result.current.state.status).toBe('preview');
    expect((await getDeck(db, mine.id))?.name).toBe('Mine');
  });

  it('replaces when asked', async () => {
    const mine = deckOf(12, 'Mine');
    await upsertDeck(db, mine, 'custom');

    const { result } = renderHook(() => useDeckImport());
    await act(async () => {
      await result.current.offer(encodeDeck({ ...mine, name: 'Theirs' }), db);
    });
    await act(async () => {
      await result.current.confirmReplace(db);
    });

    expect((await getDeck(db, mine.id))?.name).toBe('Theirs');
  });

  /**
   * Keeping both must mint fresh card ids. Two decks sharing card ids would
   * mark each other's cards as seen in a session holding both.
   */
  it('keeps both with a new deck id and new card ids', async () => {
    const mine = deckOf(12, 'Mine');
    await upsertDeck(db, mine, 'custom');

    const { result } = renderHook(() => useDeckImport());
    await act(async () => {
      await result.current.offer(encodeDeck({ ...mine, name: 'Theirs' }), db);
    });
    await act(async () => {
      await result.current.confirmKeepBoth(db);
    });

    await waitFor(() => expect(result.current.state.status).toBe('done'));
    const copyId = result.current.state.status === 'done' ? result.current.state.deck.id : '';

    expect(copyId).not.toBe(mine.id);
    expect((await getDeck(db, mine.id))?.name).toBe('Mine');

    const copy = await getDeck(db, copyId);
    expect(copy?.cards).toHaveLength(12);

    const originalIds = new Set(mine.cards.map((c) => c.id));
    expect(copy!.cards.every((c) => !originalIds.has(c.id))).toBe(true);
  });
});

describe('reset', () => {
  it('goes back to idle', async () => {
    const { result } = renderHook(() => useDeckImport());

    await act(async () => {
      await result.current.offer(encodeDeck(deckOf(12)), db);
    });
    act(() => result.current.reset());

    expect(result.current.state.status).toBe('idle');
  });
});
