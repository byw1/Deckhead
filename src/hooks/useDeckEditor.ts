import { useCallback, useMemo, useState } from 'react';
import * as edit from '@/decks/edit';
import type { Card, Deck } from '@/decks/types';
import { validateDeck, type ValidationIssue } from '@/decks/validate';

/**
 * A deck being edited.
 *
 * Holds a draft in memory and only writes when asked. Everything it does goes
 * through the pure functions in /src/decks/edit, so this is state plus a save
 * button and nothing more.
 */

export type DeckEditor = {
  draft: Deck;
  dirty: boolean;
  /** Blocks saving. Warnings do not. */
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  canSave: boolean;

  setName(name: string): void;
  setDescription(description: string): void;
  setAccentColor(accentColor: string): void;
  addCard(text: string): void;
  updateCard(cardId: string, fields: { text?: string; note?: string | null }): void;
  removeCard(cardId: string): void;
  moveUp(cardId: string): void;
  moveDown(cardId: string): void;
  bulkPaste(text: string): edit.BulkPasteResult;
  appendCards(cards: readonly Card[]): void;
  /** Replaces the baseline after a successful write, clearing dirty. */
  markSaved(saved: Deck): void;
};

export function useDeckEditor(initial: Deck): DeckEditor {
  const [baseline, setBaseline] = useState(initial);
  const [draft, setDraft] = useState(initial);

  const validation = useMemo(() => validateDeck(draft), [draft]);
  const errors = validation.ok ? [] : validation.errors;
  const warnings = validation.warnings;

  const apply = useCallback((change: (deck: Deck, at: string) => Deck) => {
    setDraft((current) => change(current, new Date().toISOString()));
  }, []);

  return {
    draft,
    dirty: edit.hasChanges(baseline, draft),
    errors,
    warnings,
    canSave: errors.length === 0,

    setName: (name) => apply((d, at) => edit.setDeckFields(d, { name }, at)),
    setDescription: (description) => apply((d, at) => edit.setDeckFields(d, { description }, at)),
    setAccentColor: (accentColor) => apply((d, at) => edit.setDeckFields(d, { accentColor }, at)),

    addCard: (text) => apply((d, at) => edit.addCard(d, text, at)),
    updateCard: (cardId, fields) => apply((d, at) => edit.updateCard(d, cardId, fields, at)),
    removeCard: (cardId) => apply((d, at) => edit.removeCard(d, cardId, at)),
    moveUp: (cardId) => apply((d, at) => edit.moveCardUp(d, cardId, at)),
    moveDown: (cardId) => apply((d, at) => edit.moveCardDown(d, cardId, at)),

    bulkPaste: (text) => edit.parseBulkPaste(text, draft.cards),
    appendCards: (cards) => apply((d, at) => edit.appendCards(d, cards, at)),

    markSaved: (saved) => {
      setBaseline(saved);
      setDraft(saved);
    },
  };
}
