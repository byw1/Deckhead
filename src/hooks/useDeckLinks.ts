import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { payloadFromLink } from '@/decks/share';

/**
 * Opens a deck link.
 *
 * Handles both the cold start case, where the app was launched by the link,
 * and the warm case, where it was already running. The payload is handed to
 * the import screen rather than written, so a link still lands on a preview
 * with a confirm tap — a link someone else controls must never install a deck
 * silently.
 */
export function useDeckLinks(): void {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const open = (url: string | null) => {
      if (!url || cancelled) return;

      const payload = payloadFromLink(url);
      if (!payload) return;

      router.push({ pathname: '/decks/import', params: { payload } });
    };

    // Launched by a link.
    void Linking.getInitialURL().then(open);

    // Already running.
    const subscription = Linking.addEventListener('url', ({ url }) => open(url));

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router]);
}
