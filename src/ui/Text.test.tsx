import { render, screen } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';
import { Text } from './Text';
import { type as typeScale } from './tokens';

/**
 * Dynamic Type. React Native scales fontSize but leaves an explicit lineHeight
 * alone, so a fixed pair clips text once someone turns text size up. These pin
 * that the two scale together.
 */

function flatten(style: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') Object.assign(out, value);
  };
  walk(style);
  return out;
}

function styleOf(testID: string) {
  return flatten(screen.getByTestId(testID).props.style);
}

describe('Text', () => {
  afterEach(() => jest.restoreAllMocks());

  it('scales line height with the device text size', () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(2);

    render(
      <Text variant="body" testID="t">
        Hello
      </Text>,
    );

    expect(styleOf('t').lineHeight).toBe(typeScale.body.lineHeight * 2);
    expect(styleOf('t').fontSize).toBe(typeScale.body.fontSize);
  });

  it('leaves line height alone at the default text size', () => {
    jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);

    render(
      <Text variant="heading" testID="t">
        Hello
      </Text>,
    );

    expect(styleOf('t').lineHeight).toBe(typeScale.heading.lineHeight);
  });

  it('keeps line height above font size at every supported scale', () => {
    for (const scale of [0.8, 1, 1.5, 2, 3]) {
      jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(scale);

      for (const variant of ['caption', 'label', 'body', 'heading', 'title'] as const) {
        render(
          <Text variant={variant} testID="t">
            Hello
          </Text>,
        );

        const { lineHeight, fontSize } = styleOf('t');
        // The clipping condition: scaled text taller than the line it sits on.
        expect(lineHeight!).toBeGreaterThanOrEqual(fontSize! * scale);
        screen.unmount();
      }
    }
  });

  it('does not opt out of font scaling, so Dynamic Type applies', () => {
    render(<Text testID="t">Hello</Text>);
    expect(screen.getByTestId('t').props.allowFontScaling).not.toBe(false);
  });

  it('renders its children', () => {
    render(<Text>Deckhead</Text>);
    expect(screen.getByText('Deckhead')).toBeTruthy();
  });

  it('accepts a style override', () => {
    render(
      <Text testID="t" style={{ color: '#123456' }}>
        Hello
      </Text>,
    );
    expect(styleOf('t')).toMatchObject({ color: '#123456' });
  });
});
