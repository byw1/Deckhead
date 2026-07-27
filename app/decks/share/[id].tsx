import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import {
  deckFileName,
  deckLink,
  measure,
  QR_ERROR_CORRECTION,
  type ShareSize,
} from '@/decks/share';
import type { StoredDeck } from '@/decks/types';
import { useDatabase } from '@/hooks/useDatabase';
import { useHaptics } from '@/hooks/useHaptics';
import { getDeck } from '@/storage/deckRepo';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space } from '@/ui/tokens';

/**
 * Share a deck.
 *
 * Target: someone builds a deck of inside jokes and seven people have it in
 * under thirty seconds. A QR on screen is the fastest path for people in the
 * same room, which is where this game is played, so it leads.
 */
export default function ShareDeckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const database = useDatabase();
  const haptics = useHaptics();
  const { width } = useWindowDimensions();

  const [deck, setDeck] = useState<StoredDeck | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (database.status !== 'ready' || !id) return;

    let cancelled = false;
    void (async () => {
      const loaded = await getDeck(database.db, id);
      if (cancelled) return;
      if (loaded) setDeck(loaded);
      else setMissing(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [database, id]);

  const size: ShareSize | null = useMemo(() => (deck ? measure(deck) : null), [deck]);

  if (database.status === 'error') {
    return (
      <Screen>
        <EmptyState title="Deckhead could not open your decks" body={database.message} />
        <View style={styles.footer}>
          <Button label="Back" variant="primary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (missing) {
    return (
      <Screen>
        <EmptyState title="That deck is gone" body="It may have been deleted." />
        <View style={styles.footer}>
          <Button label="Back" variant="primary" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  if (!deck || !size) {
    return (
      <Screen>
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      </Screen>
    );
  }

  const shareFile = async () => {
    if (busy) return;
    setBusy(true);

    try {
      // Written to cache rather than documents: it is a transient artefact of
      // sharing, not something the user owns a copy of.
      const file = new File(Paths.cache, deckFileName(deck));
      if (file.exists) file.delete();
      file.create();
      file.write(size.payload);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/octet-stream',
          dialogTitle: `Share ${deck.name}`,
          UTI: 'public.data',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(deckLink(deck));
    haptics.select();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Full width less padding, capped so it does not dominate a large screen.
  const qrSize = Math.min(width - space.lg * 2 - space.md * 2, 320);

  return (
    <Screen>
      <View style={styles.header}>
        <Text card variant="title">
          SHARE
        </Text>
        <Text variant="body" tone="muted">
          {deck.name} · {deck.cards.length} {deck.cards.length === 1 ? 'card' : 'cards'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {size.fitsQr ? (
          <View style={styles.qrSection}>
            <View style={styles.qrFrame}>
              <QRCode
                value={size.payload}
                size={qrSize}
                ecl={QR_ERROR_CORRECTION}
                backgroundColor={color.bone}
                color={color.ink}
              />
            </View>
            <Text variant="caption" tone="muted" style={styles.qrHint}>
              Point another phone&apos;s camera at this.
            </Text>
          </View>
        ) : (
          <View style={styles.tooBig}>
            <Text variant="heading">Too big for a QR code</Text>
            <Text variant="body" tone="muted">
              This deck has {deck.cards.length} cards, which is past what a scannable code holds.
              Send it as a file instead — it works the same way at the other end.
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button
            label={busy ? 'Preparing' : 'Send as a file'}
            variant={size.fitsQr ? 'secondary' : 'primary'}
            disabled={busy}
            onPress={() => void shareFile()}
            accessibilityHint="Opens the share sheet with a .deckhead file"
          />
          <Button
            label={copied ? 'Link copied' : 'Copy link'}
            onPress={() => void copyLink()}
            accessibilityHint="Copies a link that opens this deck in Deckhead"
          />
        </View>

        <Text variant="caption" tone="faint" style={styles.note}>
          Everything travels inside the link or the file. Nothing is uploaded anywhere.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Done" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: 2 },
  body: { paddingBottom: space.lg, gap: space.lg },
  qrSection: { alignItems: 'center', gap: space.sm },
  qrFrame: {
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: color.bone,
  },
  qrHint: { textAlign: 'center', paddingHorizontal: space.lg },
  tooBig: { gap: space.sm, paddingHorizontal: space.lg },
  actions: { gap: space.sm, paddingHorizontal: space.lg },
  note: { paddingHorizontal: space.lg, textAlign: 'center' },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
