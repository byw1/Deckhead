import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { createDeck } from '@/decks/edit';
import { CARD_TEXT_SOFT_CAP, MIN_PLAYABLE_CARDS, type Deck } from '@/decks/types';
import { useDatabase } from '@/hooks/useDatabase';
import { useDeckEditor } from '@/hooks/useDeckEditor';
import { useHaptics } from '@/hooks/useHaptics';
import { getDeck, upsertDeck } from '@/storage/deckRepo';
import { Button } from '@/ui/Button';
import { readableTextOn } from '@/ui/contrast';
import { EmptyState } from '@/ui/EmptyState';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { color, radius, space, type as typeScale } from '@/ui/tokens';

/** Deck colours to choose from. Deliberately few — this is not a colour picker. */
const ACCENTS = ['#FF3D6E', '#2BD576', '#FF7A45', '#7C5CFF', '#00B8D9', '#FFC53D'];

export default function DeckEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const database = useDatabase();

  const isNew = id === 'new';

  // A new deck exists from the first render, so there is nothing to load and
  // no effect to run for it.
  const [loaded, setLoaded] = useState<Deck | null>(() =>
    id === 'new' ? createDeck({ now: new Date().toISOString() }) : null,
  );
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (isNew || database.status !== 'ready' || !id) return;

    let cancelled = false;

    void (async () => {
      const deck = await getDeck(database.db, id);
      if (cancelled) return;
      if (deck) setLoaded(deck);
      else setMissing(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [database, id, isNew]);

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

  if (!loaded) {
    return (
      <Screen>
        <View style={styles.centre}>
          <ActivityIndicator color={color.brand} />
        </View>
      </Screen>
    );
  }

  return <Editor initial={loaded} isNew={isNew} />;
}

function Editor({ initial, isNew }: { initial: Deck; isNew: boolean }) {
  const router = useRouter();
  const database = useDatabase();
  const haptics = useHaptics();
  const editor = useDeckEditor(initial);

  const [newCard, setNewCard] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [saving, setSaving] = useState(false);

  const { draft } = editor;

  const save = async () => {
    if (database.status !== 'ready' || !editor.canSave || saving) return;
    setSaving(true);

    try {
      await upsertDeck(database.db, draft, 'custom');
      editor.markSaved(draft);
      haptics.select();
      router.replace(`/decks/${draft.id}`);
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (!editor.dirty) {
      router.back();
      return;
    }

    Alert.alert('Leave without saving?', 'Your changes to this deck will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const commitNewCard = () => {
    const text = newCard.trim();
    if (!text) return;
    editor.addCard(text);
    setNewCard('');
  };

  const applyPaste = () => {
    const result = editor.bulkPaste(pasteText);
    editor.appendCards(result.cards);
    setPasteText('');
    setPasting(false);
    haptics.select();

    const notes: string[] = [];
    if (result.cards.length) notes.push(`Added ${result.cards.length}.`);
    if (result.duplicates.length) notes.push(`Skipped ${result.duplicates.length} already here.`);
    if (result.overLength.length) {
      notes.push(`${result.overLength.length} over ${CARD_TEXT_SOFT_CAP} characters — they will be small on the card.`);
    }

    if (notes.length) Alert.alert('Pasted', notes.join(' '));
  };

  if (pasting) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text card variant="title">
            PASTE CARDS
          </Text>
          <Text variant="caption" tone="muted">
            One per line. Add a hint after a pipe: Card text | hint
          </Text>
        </View>

        <TextInput
          value={pasteText}
          onChangeText={setPasteText}
          placeholder={'My Chemical Romance\nFall Out Boy\nParamore'}
          placeholderTextColor={color.inkFaint}
          accessibilityLabel="Cards, one per line"
          multiline
          autoCapitalize="sentences"
          autoCorrect={false}
          style={styles.pasteBox}
        />

        <View style={styles.footer}>
          <Button label="Add them" variant="primary" onPress={applyPaste} />
          <Button
            label="Cancel"
            onPress={() => {
              setPasteText('');
              setPasting(false);
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
          {isNew ? 'NEW DECK' : 'EDIT DECK'}
        </Text>
      </View>

      <FlatList
        data={draft.cards}
        keyExtractor={(card) => card.id}
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.meta}>
            <TextInput
              value={draft.name}
              onChangeText={editor.setName}
              placeholder="Deck name"
              placeholderTextColor={color.inkFaint}
              accessibilityLabel="Deck name"
              style={styles.nameInput}
              maxLength={60}
            />
            <TextInput
              value={draft.description}
              onChangeText={editor.setDescription}
              placeholder="What is in it? (optional)"
              placeholderTextColor={color.inkFaint}
              accessibilityLabel="Deck description"
              style={styles.input}
              maxLength={280}
            />

            <View style={styles.accents}>
              {ACCENTS.map((accent) => (
                <Pressable
                  key={accent}
                  onPress={() => {
                    haptics.select();
                    editor.setAccentColor(accent);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: draft.accentColor === accent }}
                  accessibilityLabel={`Deck colour ${accent}`}
                  style={[
                    styles.accent,
                    { backgroundColor: accent },
                    draft.accentColor === accent && styles.accentSelected,
                  ]}
                >
                  {draft.accentColor === accent ? (
                    <Text variant="label" style={{ color: readableTextOn(accent) }}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>

            <View style={styles.addRow}>
              <TextInput
                value={newCard}
                onChangeText={setNewCard}
                onSubmitEditing={commitNewCard}
                placeholder="Add a card"
                placeholderTextColor={color.inkFaint}
                accessibilityLabel="New card text"
                style={[styles.input, styles.addInput]}
                returnKeyType="done"
                blurOnSubmit={false}
              />
              <Pressable
                onPress={commitNewCard}
                accessibilityRole="button"
                accessibilityLabel="Add card"
                style={styles.addButton}
              >
                <Text variant="heading">+</Text>
              </Pressable>
            </View>

            <Button label="Paste a list" onPress={() => setPasting(true)} style={styles.paste} />

            <View style={styles.countRow}>
              <Text variant="caption" tone="faint">
                {draft.cards.length} {draft.cards.length === 1 ? 'card' : 'cards'}
                {draft.cards.length < MIN_PLAYABLE_CARDS
                  ? ` · ${MIN_PLAYABLE_CARDS} needed to play`
                  : ''}
              </Text>
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const tooLong = item.text.length > CARD_TEXT_SOFT_CAP;

          return (
            <View style={styles.cardRow}>
              <View style={styles.cardBody}>
                <TextInput
                  value={item.text}
                  onChangeText={(text) => editor.updateCard(item.id, { text })}
                  accessibilityLabel={`Card ${index + 1}`}
                  style={styles.cardInput}
                  multiline
                />
                {tooLong ? (
                  <Text variant="caption" tone="muted">
                    {item.text.length} characters — small at arm&apos;s length
                  </Text>
                ) : null}
              </View>

              <View style={styles.cardActions}>
                <IconButton
                  label="↑"
                  hint={`Move card ${index + 1} up`}
                  disabled={index === 0}
                  onPress={() => editor.moveUp(item.id)}
                />
                <IconButton
                  label="↓"
                  hint={`Move card ${index + 1} down`}
                  disabled={index === draft.cards.length - 1}
                  onPress={() => editor.moveDown(item.id)}
                />
                <IconButton
                  label="×"
                  hint={`Delete card ${index + 1}`}
                  onPress={() => editor.removeCard(item.id)}
                />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            title="No cards yet"
            body="Type one above, or paste a whole list at once."
          />
        }
      />

      <View style={styles.footer}>
        {editor.errors.length > 0 ? (
          <Text variant="caption" tone="muted">
            {editor.errors[0]?.message}
          </Text>
        ) : null}
        <Button
          label={saving ? 'Saving' : 'Save'}
          variant="primary"
          disabled={!editor.canSave || saving}
          onPress={() => void save()}
        />
        <Button label="Cancel" onPress={leave} />
      </View>
    </Screen>
  );
}

function IconButton({
  label,
  hint,
  onPress,
  disabled = false,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.icon,
        disabled && styles.iconDisabled,
        pressed && !disabled && styles.iconPressed,
      ]}
    >
      <Text variant="body" tone={disabled ? 'faint' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.sm, gap: 2 },
  list: { paddingBottom: space.lg, flexGrow: 1 },
  meta: { gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  nameInput: {
    ...typeScale.heading,
    color: color.bone,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  input: {
    ...typeScale.body,
    color: color.bone,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  accents: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  accent: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  accentSelected: { borderColor: color.bone },
  addRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  addInput: { flex: 1 },
  addButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: color.surfaceRaised,
  },
  paste: { marginTop: space.xs },
  pasteBox: {
    ...typeScale.body,
    flex: 1,
    color: color.bone,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    textAlignVertical: 'top',
  },
  countRow: { paddingTop: space.xs },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  cardBody: { flex: 1, gap: 2 },
  cardInput: {
    ...typeScale.body,
    color: color.bone,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  cardActions: { flexDirection: 'row', gap: space.xs, paddingTop: space.xs },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: color.surface,
  },
  iconDisabled: { opacity: 0.35 },
  iconPressed: { backgroundColor: color.surfaceRaised },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
