import {
  bestTextContrastOn,
  contrastRatio,
  LARGE_TEXT_CONTRAST_MIN,
  parseHexColor,
  readableTextOn,
  relativeLuminance,
} from './contrast';
import { color } from './tokens';

describe('parseHexColor', () => {
  it('parses six-digit hex', () => {
    expect(parseHexColor('#FF3D6E')).toEqual({ r: 255, g: 61, b: 110 });
  });

  it('expands three-digit shorthand', () => {
    expect(parseHexColor('#f0a')).toEqual({ r: 255, g: 0, b: 170 });
  });

  it('is case insensitive and tolerates surrounding space', () => {
    expect(parseHexColor('  #ff3d6e  ')).toEqual(parseHexColor('#FF3D6E'));
  });

  it.each(['FF3D6E', '#GG0000', '#ff3d6', '#ff3d6ee', 'red', ''])('rejects %p', (input) => {
    expect(parseHexColor(input)).toBeNull();
  });
});

describe('relativeLuminance', () => {
  it('puts black at 0 and white at 1', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('weights green above red above blue', () => {
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#ff0000'));
    expect(relativeLuminance('#ff0000')).toBeGreaterThan(relativeLuminance('#0000ff'));
  });
});

describe('contrastRatio', () => {
  it('gives 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('gives 1:1 for a colour against itself', () => {
    expect(contrastRatio('#FF3D6E', '#FF3D6E')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio(color.brand, color.bone)).toBeCloseTo(
      contrastRatio(color.bone, color.brand),
      5,
    );
  });
});

describe('readableTextOn', () => {
  it('uses bone on dark accents', () => {
    expect(readableTextOn('#14121A')).toBe(color.bone);
    expect(readableTextOn('#7B2D8E')).toBe(color.bone);
  });

  it('uses ink on pale accents', () => {
    expect(readableTextOn('#FFE66D')).toBe(color.ink);
    expect(readableTextOn('#ffffff')).toBe(color.ink);
  });

  it('picks the higher-contrast option for every design token', () => {
    for (const token of [color.brand, color.correct, color.pass, color.ink]) {
      const chosen = readableTextOn(token);
      const other = chosen === color.bone ? color.ink : color.bone;
      expect(contrastRatio(token, chosen)).toBeGreaterThanOrEqual(contrastRatio(token, other));
    }
  });
});

describe('bestTextContrastOn', () => {
  it('clears AA large text for the design tokens', () => {
    for (const token of [color.brand, color.correct, color.pass, color.ink]) {
      expect(bestTextContrastOn(token)).toBeGreaterThanOrEqual(LARGE_TEXT_CONTRAST_MIN);
    }
  });

  /**
   * The load-bearing property: no deck accent can make its own card text
   * unreadable, so the deck editor needs no contrast warning. Swept across the
   * colour cube rather than asserted on a handful of samples, because the whole
   * point is that there is no exception.
   */
  it('never drops below AA large text for any colour', () => {
    let worst = Infinity;
    let worstColor = '';

    for (let r = 0; r <= 255; r += 15) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 15) {
          const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
          const best = bestTextContrastOn(hex);
          if (best < worst) {
            worst = best;
            worstColor = hex;
          }
        }
      }
    }

    // The floor sits at the luminance where bone and ink are equally bad.
    // Many colours share that luminance, so the value is asserted and the
    // specific colour is only reported if this ever regresses.
    expect({ worst: Number(worst.toFixed(2)), worstColor }).toMatchObject({ worst: 4.08 });
    expect(worst).toBeGreaterThan(LARGE_TEXT_CONTRAST_MIN);
  });

  it('is highest at the luminance extremes', () => {
    expect(bestTextContrastOn('#000000')).toBeGreaterThan(bestTextContrastOn('#5a5a5a'));
    expect(bestTextContrastOn('#ffffff')).toBeGreaterThan(bestTextContrastOn('#5a5a5a'));
  });
});
