export const themePresets = [
  { id: 'default', labelKey: 'appearance.themes.default' },
  { id: 'compact', labelKey: 'appearance.themes.compact' },
] as const;

export type ThemePresetId = (typeof themePresets)[number]['id'];
export const defaultThemePreset: ThemePresetId = 'default';
