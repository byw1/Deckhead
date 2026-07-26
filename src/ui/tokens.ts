/**
 * Design tokens.
 *
 * The brief is set by the physical situation: a phone held at arm's length on
 * someone's forehead, read by a group across a dim room, often after drinks.
 * Legibility at distance and in low light drives everything here.
 */

export const color = {
  /** App chrome base. */
  ink: '#14121A',
  /** Type on coloured surfaces. */
  bone: '#F5F2EC',
  /** Full-screen flash on a correct guess. */
  correct: '#2BD576',
  /** Full-screen flash on a pass. */
  pass: '#FF7A45',
  /** Accent, and the default colour for a deck with none set. */
  brand: '#FF3D6E',

  /**
   * Chrome greys, derived from ink by lightening toward bone. Menus need
   * separation between surfaces without introducing a second hue.
   */
  surface: '#1E1B26',
  surfaceRaised: '#2A2633',
  hairline: '#38333F',

  /** Bone at reduced emphasis, for secondary and disabled menu text. */
  inkMuted: '#9A93A5',
  inkFaint: '#635C6E',
} as const;

/**
 * Card text uses a heavy condensed grotesque, because band names and film
 * titles are long and condensed buys size. UI uses the system face: neutral,
 * costs nothing to load, and inherits Dynamic Type for the M6 accessibility
 * pass. The two must not be the same face.
 */
export const font = {
  /** Loaded at startup by useAppFonts. */
  card: 'Anton_400Regular',
  ui: undefined,
} as const;

/**
 * Menu type scale. Card text is not in this scale — it is auto-fitted to the
 * screen at render time, since the whole point is that it fills the display.
 */
export const type = {
  display: { fontSize: 40, lineHeight: 44, letterSpacing: -0.5 },
  title: { fontSize: 28, lineHeight: 33, letterSpacing: -0.3 },
  heading: { fontSize: 20, lineHeight: 25 },
  body: { fontSize: 17, lineHeight: 24 },
  label: { fontSize: 15, lineHeight: 20 },
  caption: { fontSize: 13, lineHeight: 18 },
} as const;

/** Four-point grid. */
export const space = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

/**
 * Minimum tap target, per Apple's Human Interface Guidelines. Round-screen
 * targets are half the screen each and are not bound by this.
 */
export const minTapTarget = 44;

/** Duration of the full-screen correct/pass flash. */
export const flashMs = 250;

export type ColorToken = keyof typeof color;
