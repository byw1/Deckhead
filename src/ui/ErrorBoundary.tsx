import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button } from './Button';
import { Screen } from './Screen';
import { Text } from './Text';
import { space } from './tokens';

/**
 * Last resort when a screen throws.
 *
 * There is no crash reporter to send this to — the app makes no network calls
 * at all — so the only useful thing it can do is stay on screen, say plainly
 * that the decks are safe, and offer a way back. A white screen mid-party is
 * the worst possible outcome.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (__DEV__) console.error('Deckhead crashed:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <Text card variant="title">
            SOMETHING BROKE
          </Text>
          <Text variant="body" tone="muted">
            Deckhead hit a problem on this screen. Your decks and your game are saved — nothing has
            been lost.
          </Text>
          {__DEV__ ? (
            <Text variant="caption" tone="faint">
              {error.message}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label="Try again"
            variant="primary"
            onPress={() => this.setState({ error: null })}
          />
        </View>
      </Screen>
    );
  }
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.lg, gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
