// NoSignal — coduck-inspired monochrome design tokens.
// Pure black & white, hand-drawn cartoon feel, generous spacing.

export const colors = {
  // Backgrounds
  surface: '#FFFFFF',        // primary background
  surfaceMuted: '#F5F5F5',   // card background, subtle contrast against white
  surfaceElevated: '#FFFFFF',
  cardShadow: '#1A1A1A',

  // Text
  textPrimary: '#0A0A0A',    // near-pure black for headings/body
  textSecondary: '#4A4A4A',  // grey-medium for captions
  textTertiary: '#8A8A8A',   // grey-light for placeholders
  textInverse: '#FFFFFF',    // text on dark CTAs

  // Ink strokes / borders (mimicking hand-drawn lines)
  ink: '#0A0A0A',
  inkSoft: '#1A1A1A',
  border: '#E5E5E5',
  divider: '#EDEDED',

  // CTA — solid black round button (like coduck "Start")
  cta: '#0A0A0A',
  ctaText: '#FFFFFF',
  ctaPressed: '#1F1F1F',
  ctaDisabled: '#C4C4C4',

  // Semantic — kept greyscale-adjacent per coduck aesthetic. Only used for
  // status indicators, never large fills.
  primary: '#0A0A0A',        // primary = ink for this style system
  primaryDark: '#000000',
  success: '#2F7A48',        // muted forest green — only for the tiny online dot
  danger: '#B22222',         // muted crimson — only for tiny offline dot / errors
  warning: '#8A6D0C',        // muted amber — used sparingly
  online: '#2F7A48',
  offline: '#B22222',

  // Bookmark accent (coduck uses a subtle gold bookmark on cards)
  bookmark: '#D4A017',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 8,
  md: 16,       // card radius — bigger and more generous than SDK default
  lg: 24,       // large card / phone-frame feel
  xl: 32,
  pill: 999,
};

export const typography = {
  // Big, tight headlines matching coduck's "Learn to code. Free for students."
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800' as const,
    letterSpacing: -0.8,
  },
  greeting: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
  },
  micro: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  mono: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    fontFamily: 'Menlo',
  },
};

// Soft shadows to give cards a paper-like lift, mimicking coduck's flat
// but slightly-elevated cards.
export const shadows = {
  sm: {
    shadowColor: colors.cardShadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: colors.cardShadow,
    shadowOffset: {width: 0, height: 6},
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  lg: {
    shadowColor: colors.cardShadow,
    shadowOffset: {width: 0, height: 12},
    shadowOpacity: 0.14,
    shadowRadius: 28,
    elevation: 14,
  },
};

export const touchTargets = {
  min: 44,
  primary: 56,
  hero: 72,      // large round CTA like coduck's "Start" button
};

// Hand-drawn character illustrations bundled with the app.
// Assets live in mobile/assets/characters/ and are consumed via require().
export const characters = {
  thinking: require('../../assets/characters/thinking.png'),
  diagnosing: require('../../assets/characters/diagnosing.png'),
  success: require('../../assets/characters/success.png'),
  handoff: require('../../assets/characters/handoff.png'),
};
