import { Pressable, StyleSheet } from 'react-native';
import { Text } from './Text';
import { color, minTapTarget, radius, space } from './tokens';

export type ChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** radio for one-of-many, checkbox for many-of-many. */
  role?: 'radio' | 'checkbox';
};

export function Chip({ label, selected, onPress, accessibilityLabel, role = 'radio' }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
    >
      <Text variant="label" tone={selected ? 'default' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: minTapTarget,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selected: {
    backgroundColor: color.surfaceRaised,
    borderColor: color.brand,
  },
  pressed: {
    opacity: 0.8,
  },
});
