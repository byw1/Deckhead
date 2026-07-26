import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { color, minTapTarget, radius, space } from './tokens';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text variant="heading" tone={disabled ? 'faint' : 'default'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: minTapTarget + 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  primary: {
    backgroundColor: color.brand,
  },
  secondary: {
    backgroundColor: color.surface,
  },
  disabled: {
    backgroundColor: color.surface,
  },
  pressed: {
    opacity: 0.85,
  },
});
