import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { openDatabase } from '@/storage/database';
import { seedBundledDecks } from '@/storage/seed';

/**
 * Opens the database, migrates it and installs the bundled decks.
 *
 * One place owns startup so a screen never has to wonder whether the decks are
 * there yet.
 */

export type DatabaseState =
  | { status: 'loading' }
  | { status: 'ready'; db: SQLiteDatabase }
  | { status: 'error'; message: string };

export function useDatabase(): DatabaseState {
  const [state, setState] = useState<DatabaseState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const db = await openDatabase();
        const report = await seedBundledDecks(db);

        if (report.rejected.length > 0) {
          // A build problem rather than a user problem, and the app still
          // works with whatever installed. Loud in development, silent in
          // production because there is nothing the user could do about it.
          if (__DEV__) {
            console.warn('Bundled decks failed validation:', report.rejected);
          }
        }

        if (!cancelled) setState({ status: 'ready', db });
      } catch (error) {
        if (cancelled) return;
        setState({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Deckhead could not open your decks. Restarting the app usually fixes it.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
