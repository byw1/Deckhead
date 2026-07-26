import { act, renderHook } from '@testing-library/react-native';
import { createDeck } from '@/decks/edit';
import { MIN_PLAYABLE_CARDS } from '@/decks/types';
import { useDeckEditor } from './useDeckEditor';

/**
 * The hook is glue over the pure functions in /src/decks/edit, which are
 * covered thoroughly there. This checks the glue: dirty tracking, what blocks
 * saving, and that saving clears the unsaved-changes flag.
 */

const NOW = '2026-07-26T18:00:00Z';

function editor(name = 'Test') {
  return renderHook(() => useDeckEditor(createDeck({ now: NOW, name })));
}

describe('useDeckEditor', () => {
  it('starts clean', () => {
    expect(editor().result.current.dirty).toBe(false);
  });

  it('goes dirty on an edit and clean again on save', () => {
    const { result } = editor();

    act(() => result.current.addCard('One'));
    expect(result.current.dirty).toBe(true);

    act(() => result.current.markSaved(result.current.draft));
    expect(result.current.dirty).toBe(false);
  });

  it('blocks saving a deck with no name', () => {
    const { result } = editor('');
    expect(result.current.canSave).toBe(false);
    expect(result.current.errors.some((e) => e.path === 'name')).toBe(true);

    act(() => result.current.setName('Named'));
    expect(result.current.canSave).toBe(true);
  });

  /** A short deck may exist, it just cannot start a round. */
  it('allows saving a deck too short to play, but warns', () => {
    const { result } = editor();

    act(() => result.current.addCard('Only one'));

    expect(result.current.canSave).toBe(true);
    expect(result.current.warnings.some((w) => w.message.includes(String(MIN_PLAYABLE_CARDS)))).toBe(
      true,
    );
  });

  it('edits, reorders and removes cards', () => {
    const { result } = editor();

    act(() => {
      result.current.addCard('One');
      result.current.addCard('Two');
    });
    expect(result.current.draft.cards.map((c) => c.text)).toEqual(['One', 'Two']);

    const first = result.current.draft.cards[0]!.id;

    act(() => result.current.moveDown(first));
    expect(result.current.draft.cards.map((c) => c.text)).toEqual(['Two', 'One']);

    act(() => result.current.updateCard(first, { text: 'Edited' }));
    expect(result.current.draft.cards.map((c) => c.text)).toEqual(['Two', 'Edited']);

    act(() => result.current.removeCard(first));
    expect(result.current.draft.cards.map((c) => c.text)).toEqual(['Two']);
  });

  it('pastes a list and reports what it skipped', () => {
    const { result } = editor();

    act(() => result.current.addCard('One'));

    let pasted: ReturnType<typeof result.current.bulkPaste> | null = null;
    act(() => {
      pasted = result.current.bulkPaste('One\nTwo\nThree');
    });

    expect(pasted!.cards.map((c) => c.text)).toEqual(['Two', 'Three']);
    expect(pasted!.duplicates).toEqual(['One']);

    act(() => result.current.appendCards(pasted!.cards));
    expect(result.current.draft.cards.map((c) => c.text)).toEqual(['One', 'Two', 'Three']);
  });
});
