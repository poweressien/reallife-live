import { brand } from '@/config/brand';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  accent: string;
  live: string;
  danger: string;
  success: string;
  overlay: string;
};

export const darkColors: ThemeColors = {
  background: '#0B0B12',
  surface: '#15151F',
  surfaceAlt: '#1F1F2D',
  border: '#2A2A3A',
  text: '#F5F5FA',
  textMuted: '#9A9AB0',
  primary: brand.colors.primary,
  primaryPressed: brand.colors.primaryPressed,
  onPrimary: '#FFFFFF',
  accent: brand.colors.accent,
  live: brand.colors.live,
  danger: '#FF5A5F',
  success: '#2BD576',
  overlay: 'rgba(0,0,0,0.55)',
};

export const lightColors: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F4F4F8',
  surfaceAlt: '#E9E9F0',
  border: '#DADAE4',
  text: '#12121A',
  textMuted: '#62627A',
  primary: brand.colors.primary,
  primaryPressed: brand.colors.primaryPressed,
  onPrimary: '#FFFFFF',
  accent: brand.colors.accent,
  live: brand.colors.live,
  danger: '#D93036',
  success: '#12994F',
  overlay: 'rgba(0,0,0,0.45)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

export const typography = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800' as const },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
};

/** Minimum touch target (dp) for accessible controls. */
export const MIN_TOUCH = 44;
