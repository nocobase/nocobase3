import { PresetContext } from './theme-context';
import { resolveAppBase } from '@nocobase/app-client';
import {
  ThemeProvider as NextThemesProvider,
  useTheme,
  type ThemeProviderProps,
} from 'next-themes';
import { useEffect, useState, type ReactElement } from 'react';
import { readThemePreference, themeStorageKeys } from './theme-preferences';
import {
  defaultThemePreset,
  themePresets,
  type ThemePresetId,
} from './theme-presets';

const validPreset = (value: string | null): ThemePresetId =>
  themePresets.find((item) => item.id === value)?.id ?? defaultThemePreset;

function ModeStorageSync({ storageKey }: { storageKey: string }): null {
  const { setTheme } = useTheme();
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (
        event.key === null ||
        (event.key === storageKey &&
          !['light', 'dark', 'system'].includes(event.newValue ?? ''))
      ) {
        // next-themes handles valid values; normalize after its storage listener.
        queueMicrotask(() => setTheme('system'));
      }
    };
    window.addEventListener('storage', sync, true);
    return () => window.removeEventListener('storage', sync, true);
  }, [setTheme, storageKey]);
  return null;
}

export function AppThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'system',
  enableSystem = true,
  storageKey = themeStorageKeys(resolveAppBase()).mode,
  ...props
}: ThemeProviderProps): ReactElement {
  const presetKey = themeStorageKeys(resolveAppBase()).preset;
  const [preset, setPreset] = useState(() =>
    validPreset(readThemePreference(presetKey)),
  );
  const selectPreset = (value: ThemePresetId) => {
    setPreset(value);
    try {
      localStorage.setItem(presetKey, value);
    } catch {
      /* Keep the in-memory selection. */
    }
  };
  useEffect(() => {
    document.documentElement.dataset.theme = preset;
  }, [preset]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === presetKey || event.key === null)
        setPreset(validPreset(event.newValue));
    };
    window.addEventListener('storage', sync, true);
    return () => window.removeEventListener('storage', sync, true);
  }, [presetKey]);
  return (
    <NextThemesProvider
      {...props}
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      storageKey={storageKey}
    >
      <ModeStorageSync storageKey={storageKey} />
      <PresetContext.Provider value={{ preset, setPreset: selectPreset }}>
        {children}
      </PresetContext.Provider>
    </NextThemesProvider>
  );
}
