import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { space } from './tokens';

export type EmptyStateProps = {
  title: string;
  /** What to do next. Empty states are invitations, not apologies. */
  body: string;
};

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Text variant="heading">{title}</Text>
      <Text variant="body" tone="muted" style={styles.body}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  body: {
    textAlign: 'center',
  },
});
