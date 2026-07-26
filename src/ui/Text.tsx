import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';
import { color, font, type } from './tokens';

type Variant = keyof typeof type;
type Tone = 'default' | 'muted' | 'faint';

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  /** Use the condensed card face rather than the UI face. */
  card?: boolean;
};

const tones: Record<Tone, string> = {
  default: color.bone,
  muted: color.inkMuted,
  faint: color.inkFaint,
};

/** UI text. Card text is its own component, since it auto-fits rather than scaling. */
export function Text({ variant = 'body', tone = 'default', card = false, style, ...rest }: TextProps) {
  return (
    <RNText
      style={StyleSheet.compose(
        [type[variant], { color: tones[tone] }, card ? { fontFamily: font.card } : null],
        style,
      )}
      {...rest}
    />
  );
}
