export type ThemeId = 'midnight-indigo' | 'ocean-breeze' | 'emerald-focus' | 'royal-purple' | 'light-minimal';
export type ThemeMode = 'dark' | 'light';

export interface ThemeDef {
  id: ThemeId;
  name: string;
  description: string;
  defaultMode: ThemeMode;
  /** Swatch colours for the picker (dark appearance first, light second). */
  swatch: { dark: [string, string, string]; light: [string, string, string] };
}

export const THEMES: ThemeDef[] = [
  { id: 'midnight-indigo', name: 'Midnight Indigo', description: 'Dark navy, indigo and electric blue', defaultMode: 'dark',
    swatch: { dark: ['#0b1020', '#4f46e5', '#7daaff'], light: ['#f5f7ff', '#4f46e5', '#2563eb'] } },
  { id: 'ocean-breeze', name: 'Ocean Breeze', description: 'Deep blue, cyan and teal', defaultMode: 'dark',
    swatch: { dark: ['#061a2b', '#0e7490', '#22d3ee'], light: ['#f0f9ff', '#0e7490', '#0d9488'] } },
  { id: 'emerald-focus', name: 'Emerald Focus', description: 'Emerald green, mint and slate', defaultMode: 'dark',
    swatch: { dark: ['#07130f', '#047857', '#34d399'], light: ['#f3faf6', '#047857', '#475569'] } },
  { id: 'royal-purple', name: 'Royal Purple', description: 'Violet, purple and soft lavender', defaultMode: 'dark',
    swatch: { dark: ['#120b1f', '#7c3aed', '#c4b5fd'], light: ['#faf7ff', '#6d28d9', '#c084fc'] } },
  { id: 'light-minimal', name: 'Light Minimal', description: 'White, light grey and blue accents', defaultMode: 'light',
    swatch: { dark: ['#0f1115', '#2563eb', '#60a5fa'], light: ['#ffffff', '#2563eb', '#e2e8f0'] } },
];

export const DEFAULT_THEME: ThemeId = 'midnight-indigo';
export const STORAGE_KEY = 'macro.theme';

export function isThemeId(v: unknown): v is ThemeId {
  return typeof v === 'string' && THEMES.some((t) => t.id === v);
}

/** "ocean-breeze:light" <-> { theme, mode } (format stored on the profile). */
export function encodeTheme(theme: ThemeId, mode: ThemeMode) {
  return `${theme}:${mode}`;
}
export function decodeTheme(value: string | null | undefined): { theme: ThemeId; mode: ThemeMode } | null {
  if (!value) return null;
  const [theme, mode] = value.split(':');
  if (!isThemeId(theme) || (mode !== 'dark' && mode !== 'light')) return null;
  return { theme, mode };
}
