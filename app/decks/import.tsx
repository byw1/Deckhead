import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { extractPayload } from '@/decks/share';
import { useDatabase } from '@/hooks/useDatabase';
import { useDeckImport } from '@/hooks/useDeckImport';
import { useHaptics } from '@/hooks/useHaptics';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { readableTextOn } from '@/ui/contrast';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space, type as typeScale } from '@/ui/tokens';

type Method = 'scan' | 'paste' | 'file';

/**
 * Import a deck.
 *
 * Scan, file or paste, then always a preview and a confirm tap. Nothing is
 * ever written without being shown first.
 */
export default function ImportDeckScreen() {
  const router = useRouter();
  const database = useDatabase();
  const haptics = useHaptics();
  const importer = useDeckImport();

  /** Set when arriving from a deep link, which skips straight to the preview. */
  const { payload } = useLocalSearchParams<{ payload?: string }>();

  const [method, setMethod] = useState<Method>('scan');
  const [pasted, setPasted] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const scanning = useRef(false);

  const db = database.status === 'ready' ? database.db : null;

  const offer = useCallback(
    (text: string) => {
      if (!db) return;
      const found = extractPayload(text) ?? text;
      void importer.offer(found, db);
    },
    [db, importer],
  );

  useEffect(() => {
    if (payload && db && importer.state.status === 'idle') offer(payload);
  }, [payload, db, importer.state.status, offer]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;

    try {
      const contents = new File(result.assets[0].uri).textSync();
      offer(contents);
    } catch {
      offer('');
    }
  };

  const preview = importer.state.status === 'preview' ? importer.state : null;
  const done = importer.state.status === 'done' ? importer.state : null;
  const error = importer.state.status === 'error' ? importer.state : null;

  if (done) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text card variant="title">
            {done.action === 'replaced' ? 'REPLACED' : 'ADDED'}
          </Text>
          <Text variant="body" tone="muted">
            {done.deck.name} · {done.deck.cards.length} cards
            {done.action === 'copied' ? ' · saved as a copy' : ''}
          </Text>
        </View>

        <View style={styles.footer}>
          <Button
            label="Open it"
            variant="primary"
            onPress={() => router.replace(`/decks/${done.deck.id}`)}
          />
          <Button
            label="Import another"
            onPress={() => {
              importer.reset();
              setPasted('');
            }}
          />
        </View>
      </Screen>
    );
  }

  if (preview) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text card variant="title">
            IMPORT
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.previewCard, { backgroundColor: preview.deck.accentColor }]}>
            <Text
              card
              variant="title"
              style={{ color: readableTextOn(preview.deck.accentColor) }}
              numberOfLines={2}
            >
              {preview.deck.name.toUpperCase()}
            </Text>
            <Text variant="label" style={{ color: readableTextOn(preview.deck.accentColor) }}>
              {preview.deck.cards.length} {preview.deck.cards.length === 1 ? 'card' : 'cards'}
              {preview.deck.author ? ` · by ${preview.deck.author}` : ''}
            </Text>
          </View>

          {preview.deck.description ? (
            <Text variant="body" tone="muted" style={styles.pad}>
              {preview.deck.description}
            </Text>
          ) : null}

          {/* A few cards, so it is obvious what you are agreeing to. */}
          <View style={styles.sample}>
            {preview.deck.cards.slice(0, 5).map((card) => (
              <Text key={card.id} variant="caption" tone="faint" numberOfLines={1}>
                {card.text}
              </Text>
            ))}
            {preview.deck.cards.length > 5 ? (
              <Text variant="caption" tone="faint">
                and {preview.deck.cards.length - 5} more
              </Text>
            ) : null}
          </View>

          {preview.warnings.map((warning) => (
            <Text key={warning} variant="caption" tone="muted" style={styles.pad}>
              {warning}
            </Text>
          ))}

          {preview.collides ? (
            <Text variant="caption" tone="muted" style={styles.pad}>
              You already have this deck. Replacing overwrites your copy, including any changes you
              made to it.
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {preview.collides ? (
            <>
              <Button
                label="Keep both"
                variant="primary"
                onPress={() => {
                  haptics.select();
                  if (db) void importer.confirmKeepBoth(db);
                }}
              />
              <Button
                label="Replace mine"
                onPress={() => {
                  haptics.select();
                  if (db) void importer.confirmReplace(db);
                }}
              />
            </>
          ) : (
            <Button
              label="Add this deck"
              variant="primary"
              onPress={() => {
                haptics.select();
                if (db) void importer.confirmAdd(db);
              }}
            />
          )}
          <Button
            label="Cancel"
            onPress={() => {
              importer.reset();
              scanning.current = false;
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text card variant="title">
          IMPORT
        </Text>
        <Text variant="caption" tone="muted">
          Scan a code, open a file, or paste a link
        </Text>
      </View>

      <View style={styles.methods}>
        <Chip label="Scan" selected={method === 'scan'} onPress={() => setMethod('scan')} />
        <Chip label="Paste" selected={method === 'paste'} onPress={() => setMethod('paste')} />
        <Chip label="File" selected={method === 'file'} onPress={() => setMethod('file')} />
      </View>

      {error ? (
        <Text variant="body" tone="muted" style={styles.error}>
          {error.message}
        </Text>
      ) : null}

      {method === 'scan' ? (
        <View style={styles.scanArea}>
          {permission?.granted ? (
            <View style={styles.camera}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => {
                  // Fires every frame while a code is visible, so this is
                  // latched rather than debounced — one scan, one preview.
                  if (scanning.current) return;
                  scanning.current = true;
                  haptics.select();
                  offer(data);
                }}
              />
            </View>
          ) : (
            <View style={styles.permission}>
              <Text variant="body" tone="muted">
                Deckhead needs the camera to scan a deck code. It is used for nothing else and no
                images are stored.
              </Text>
              <Button
                label={permission?.canAskAgain === false ? 'Open Settings' : 'Allow camera'}
                variant="primary"
                onPress={() => void requestPermission()}
              />
            </View>
          )}
        </View>
      ) : null}

      {method === 'paste' ? (
        <View style={styles.pasteArea}>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            placeholder="Paste a deckhead:// link or a deck code"
            placeholderTextColor={color.inkFaint}
            accessibilityLabel="Deck link or code"
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.pasteBox}
          />
          <Button
            label="Import"
            variant="primary"
            disabled={!pasted.trim()}
            onPress={() => offer(pasted)}
          />
        </View>
      ) : null}

      {method === 'file' ? (
        <View style={styles.pasteArea}>
          <Text variant="body" tone="muted">
            Open a .deckhead file someone sent you.
          </Text>
          <Button label="Choose a file" variant="primary" onPress={() => void pickFile()} />
        </View>
      ) : null}

      <View style={styles.footer}>
        <Button label="Back" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: 2 },
  methods: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg },
  body: { paddingBottom: space.lg, gap: space.md },
  scanArea: { flex: 1, padding: space.lg },
  camera: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: color.surface,
  },
  permission: {
    flex: 1,
    justifyContent: 'center',
    gap: space.md,
  },
  pasteArea: { flex: 1, padding: space.lg, gap: space.md },
  pasteBox: {
    ...typeScale.body,
    flex: 1,
    color: color.bone,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    textAlignVertical: 'top',
  },
  previewCard: {
    marginHorizontal: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    gap: space.xs,
  },
  sample: { paddingHorizontal: space.lg, gap: 2 },
  pad: { paddingHorizontal: space.lg },
  error: { paddingHorizontal: space.lg, paddingTop: space.sm },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
});
