import { useMemo } from 'react';
import {
  PixelRatio,
  Text as RNText,
  type TextProps as RNTextProps,
  StyleSheet,
} from 'react-native';
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

/**
 * UI text.
 *
 * Line height is scaled by the device's text size setting alongside the font
 * size. React Native scales fontSize for Dynamic Type but leaves an explicit
 * lineHeight alone, so a fixed pair clips descenders and then whole lines once
 * someone turns text size up — which is exactly the person who needed it.
 *
 * Card text is its own component: it auto-fits to the screen rather than
 * scaling, because it is already as large as the display allows.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  card = false,
  style,
  ...rest
}: TextProps) {
  const scaled = useMemo(() => {
    const base = type[variant];
    const scale = PixelRatio.getFontScale();
    return { ...base, lineHeight: base.lineHeight * scale };
  }, [variant]);

  return (
    <RNText
      style={StyleSheet.compose(
        [scaled, { color: tones[tone] }, card ? { fontFamily: font.card } : null],
        style,
      )}
      {...rest}
    />
  );
}
