import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { space } from './tokens';

export type StepHeaderProps = {
  step: number;
  of: number;
  title: string;
  subtitle?: string;
};

export function StepHeader({ step, of, title, subtitle }: StepHeaderProps) {
  return (
    <View style={styles.header}>
      <Text variant="caption" tone="faint" style={styles.step}>
        STEP {step} OF {of}
      </Text>
      <Text card variant="title">
        {title.toUpperCase()}
      </Text>
      {subtitle ? (
        <Text variant="caption" tone="muted">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
    gap: 2,
  },
  step: {
    letterSpacing: 1.2,
  },
});
