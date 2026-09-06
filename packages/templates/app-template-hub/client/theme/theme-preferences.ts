// Shared preference helpers for normal client startup and the React provider.
export function themeStorageKeys(base: string): {
  mode: string;
  preset: string;
} {
  const path = base.replace(/^\/+|\/+$/g, '');
  const scope = path ? encodeURIComponent(path) : '%2F';
  return {
    mode: `nocobase:${scope}:theme:color-scheme`,
    preset: `nocobase:${scope}:theme:preset`,
  };
}

export function readThemePreference(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function initializeTheme(
  base: string,
  presets: readonly string[],
): void {
  const keys = themeStorageKeys(base);
  const savedMode = readThemePreference(keys.mode);
  const mode =
    savedMode === 'light' || savedMode === 'dark' ? savedMode : 'system';
  const savedPreset = readThemePreference(keys.preset);
  const preset =
    savedPreset && presets.includes(savedPreset) ? savedPreset : presets[0];
  const resolved =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);
  document.documentElement.dataset.theme = preset;
  document.documentElement.style.colorScheme = resolved;
  // next-themes reads storage itself; normalize invalid modes before it mounts.
  if (savedMode && !['light', 'dark', 'system'].includes(savedMode)) {
    try {
      localStorage.removeItem(keys.mode);
    } catch {
      /* Storage can be unavailable. */
    }
  }
}
