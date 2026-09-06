export const themePresets = [
  { id: 'default', labelKey: 'appearance.themes.default' },
  { id: 'compact', labelKey: 'appearance.themes.compact' },
  { id: 'ant-design', labelKey: 'appearance.themes.antDesign' },
] as const;

export type ThemePresetId = (typeof themePresets)[number]['id'];
export const defaultThemePreset: ThemePresetId = 'default';
