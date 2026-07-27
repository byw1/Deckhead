import { useCallback, useState } from 'react';
import { duplicateDeck } from '@/decks/edit';
import { decodeDeck, type DecodeFailure } from '@/decks/share';
import type { Deck } from '@/decks/types';
import { deckExists, upsertDeck } from '@/storage/deckRepo';
import type { Sql } from '@/storage/sql';

/**
 * Importing a deck.
 *
 * Never silent. A payload arriving from a QR, a file or a paste always lands
 * in a preview with the deck name and card count, and waits for a tap.
 *
 * A deck whose id is already here prompts to replace or keep both, and keeping
 * both goes through duplicateDeck so the copy gets fresh card ids — otherwise
 * the two would mark each other's cards as seen in a session holding both.
 */

export type ImportState =
  | { status: 'idle' }
  | { status: 'preview'; deck: Deck; collides: boolean; warnings: string[] }
  | { status: 'error'; reason: DecodeFailure; message: string }
  | { status: 'done'; deck: Deck; action: 'added' | 'replaced' | 'copied' };

export type DeckImport = {
  state: ImportState;
  /** Decodes and previews. Writes nothing. */
  offer(payload: string, db: Sql): Promise<void>;
  confirmAdd(db: Sql): Promise<void>;
  confirmReplace(db: Sql): Promise<void>;
  confirmKeepBoth(db: Sql): Promise<void>;
  reset(): void;
};

export function useDeckImport(): DeckImport {
  const [state, setState] = useState<ImportState>({ status: 'idle' });

  const offer = useCallback(async (payload: string, db: Sql) => {
    const result = decodeDeck(payload);

    if (!result.ok) {
      setState({ status: 'error', reason: result.reason, message: result.message });
      return;
    }

    setState({
      status: 'preview',
      deck: result.deck,
      collides: await deckExists(db, result.deck.id),
      warnings: result.warnings.map((w) => w.message),
    });
  }, []);

  const write = useCallback(
    async (db: Sql, deck: Deck, action: 'added' | 'replaced' | 'copied') => {
      await upsertDeck(db, deck, 'custom');
      setState({ status: 'done', deck, action });
    },
    [],
  );

  return {
    state,

    offer,

    async confirmAdd(db) {
      if (state.status !== 'preview' || state.collides) return;
      await write(db, state.deck, 'added');
    },

    async confirmReplace(db) {
      if (state.status !== 'preview') return;
      await write(db, state.deck, 'replaced');
    },

    async confirmKeepBoth(db) {
      if (state.status !== 'preview') return;
      // Fresh deck id and fresh card ids, so the copy is genuinely separate.
      await write(db, duplicateDeck(state.deck, new Date().toISOString()), 'copied');
    },

    reset() {
      setState({ status: 'idle' });
    },
  };
}
