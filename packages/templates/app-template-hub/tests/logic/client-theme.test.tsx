import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../../client/locales/index.js';
import { themePresets } from '../../client/theme/theme-presets';
import { initializeTheme } from '../../client/theme/theme-preferences';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AppThemeProvider,
  ThemeModeToggle,
  useTheme,
  useThemePreset,
} from '../../client/theme/index.ts';

describe('app client theme', () => {
  it.each([
    ['en-US', 'Switch between light and dark'],
    ['zh-CN', '切换浅色/深色'],
  ])(
    'switches light and dark from the header toggle (%s)',
    async (locale, label) => {
      const runtime = new I18nRuntime({
        defaultLocale: 'en-US',
        locales: ['en-US', 'zh-CN'],
        applicationNamespace: 'test-app',
      });
      runtime.registerApplicationNamespace('test-app', locales);
      await runtime.init(locale);
      render(
        <I18nProvider runtime={runtime}>
          <AppThemeProvider>
            <ThemeModeToggle />
          </AppThemeProvider>
        </I18nProvider>,
      );
      const toggle = screen.getByRole('button', { name: label });
      expect(toggle).not.toHaveAttribute('title');

      // The browser follows the system at rest, so the first click states the opposite mode outright.
      await userEvent.click(toggle);
      expect(document.documentElement).toHaveClass('light');
      expect(localStorage.getItem('nocobase:crm:theme:color-scheme')).toBe(
        'light',
      );

      await userEvent.click(toggle);
      expect(document.documentElement).toHaveClass('dark');
      expect(localStorage.getItem('nocobase:crm:theme:color-scheme')).toBe(
        'dark',
      );
    },
  );

  it('falls back from the removed Ant Design preset without changing mode', async () => {
    localStorage.setItem('nocobase:crm:theme:preset', 'ant-design');
    localStorage.setItem('nocobase:crm:theme:color-scheme', 'light');
    render(
      <AppThemeProvider>
        <PresetProbe />
      </AppThemeProvider>,
    );
    expect(themePresets.map(({ id }) => id)).not.toContain('ant-design');
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    expect(screen.getByTestId('preset')).toHaveTextContent('default');
    expect(document.documentElement).toHaveClass('light');
  });

  it('omits Ocean and falls back from its saved ID to Default', async () => {
    localStorage.setItem('nocobase:crm:theme:preset', 'ocean');
    render(
      <AppThemeProvider>
        <PresetProbe />
      </AppThemeProvider>,
    );
    expect(themePresets.map(({ id }) => id)).not.toContain('ocean');
    expect(screen.getByTestId('preset')).toHaveTextContent('default');
    expect(themePresets.map(({ id }) => id)).toContain('modern-minimal');
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
  });

  beforeEach(() => {
    vi.stubGlobal('APP_BASE_PATH', '/crm/');
    localStorage.clear();
    document.getElementById('nocobase-runtime-config')?.remove();
    document.documentElement.removeAttribute('class');
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.getElementById('nocobase-runtime-config')?.remove();
    document.documentElement.removeAttribute('class');
    document.documentElement.removeAttribute('style');
    document.documentElement.removeAttribute('data-theme');
  });

  it.each([
    [undefined, undefined, 'light', 'default'],
    ['dark', 'modern-minimal', 'dark', 'modern-minimal'],
    ['system', 'removed', 'dark', 'default'],
    ['invalid', 'modern-minimal', 'light', 'modern-minimal'],
  ])(
    'uses configured defaults with saved mode %s and preset %s',
    async (savedMode, savedPreset, mode, preset) => {
      const config = document.createElement('script');
      config.id = 'nocobase-runtime-config';
      config.type = 'application/json';
      config.textContent = JSON.stringify({
        version: 1,
        config: {
          app: { defaultColorScheme: 'light', defaultTheme: 'default' },
        },
      });
      document.body.append(config);
      if (savedMode)
        localStorage.setItem('nocobase:crm:theme:color-scheme', savedMode);
      if (savedPreset)
        localStorage.setItem('nocobase:crm:theme:preset', savedPreset);
      initializeTheme(
        '/crm/',
        themePresets.map(({ id }) => id),
      );
      expect(document.documentElement).toHaveClass(mode);
      expect(document.documentElement).toHaveAttribute('data-theme', preset);
      render(
        <AppThemeProvider>
          <ThemeProbe />
          <PresetProbe />
        </AppThemeProvider>,
      );
      await waitFor(() => expect(document.documentElement).toHaveClass(mode));
      expect(document.documentElement).toHaveAttribute('data-theme', preset);
      expect(screen.getByTestId('preset')).toHaveTextContent(preset);
      if (!savedMode)
        expect(
          localStorage.getItem('nocobase:crm:theme:color-scheme'),
        ).toBeNull();
      if (!savedPreset)
        expect(localStorage.getItem('nocobase:crm:theme:preset')).toBeNull();
      localStorage.clear();
      fireEvent(window, new StorageEvent('storage', { key: null }));
      await waitFor(() =>
        expect(document.documentElement).toHaveClass('light'),
      );
      expect(document.documentElement).toHaveAttribute('data-theme', 'default');
      expect(
        localStorage.getItem('nocobase:crm:theme:color-scheme'),
      ).toBeNull();
    },
  );

  it.each([
    [undefined, undefined, 'default'],
    ['modern-minimal', undefined, 'modern-minimal'],
    [undefined, 'modern-minimal', 'modern-minimal'],
    ['modern-minimal', 'default', 'default'],
  ])(
    'keeps startup and Provider consistent (%s, %s)',
    async (configured, saved, expected) => {
      const config = document.createElement('script');
      config.id = 'nocobase-runtime-config';
      config.type = 'application/json';
      config.textContent = JSON.stringify({
        version: 1,
        config: { app: { defaultTheme: configured } },
      });
      document.body.append(config);
      const key = 'nocobase:crm:theme:preset';
      if (saved) localStorage.setItem(key, saved);
      initializeTheme(
        '/crm/',
        themePresets.map(({ id }) => id),
      );
      expect(document.documentElement).toHaveAttribute('data-theme', expected);
      render(
        <AppThemeProvider>
          <PresetProbe />
        </AppThemeProvider>,
      );
      expect(screen.getByTestId('preset')).toHaveTextContent(expected);
      expect(document.documentElement).toHaveAttribute('data-theme', expected);
      expect(localStorage.getItem(key)).toBe(saved ?? null);
    },
  );

  it.each([null, 'invalid'])(
    'syncs deleted or invalid modes without writing defaults (%s)',
    async (newValue) => {
      const config = document.createElement('script');
      config.id = 'nocobase-runtime-config';
      config.type = 'application/json';
      config.textContent = JSON.stringify({
        version: 1,
        config: { app: { defaultColorScheme: 'light' } },
      });
      document.body.append(config);
      localStorage.setItem('nocobase:crm:theme:color-scheme', 'dark');
      render(
        <AppThemeProvider>
          <ThemeProbe />
        </AppThemeProvider>,
      );
      const write = vi.spyOn(Storage.prototype, 'setItem');
      fireEvent(
        window,
        new StorageEvent('storage', {
          key: 'nocobase:crm:theme:color-scheme',
          newValue,
        }),
      );
      await waitFor(() =>
        expect(document.documentElement).toHaveClass('light'),
      );
      expect(write).not.toHaveBeenCalled();
    },
  );

  it('uses configured defaults without storage and preserves explicit Provider mode', async () => {
    const config = document.createElement('script');
    config.id = 'nocobase-runtime-config';
    config.type = 'application/json';
    config.textContent = JSON.stringify({
      version: 1,
      config: { app: { defaultColorScheme: 'light', defaultTheme: 'default' } },
    });
    document.body.append(config);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    initializeTheme(
      '/crm/',
      themePresets.map(({ id }) => id),
    );
    expect(document.documentElement).toHaveClass('light');
    const { unmount } = render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('light'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    unmount();
    render(
      <AppThemeProvider defaultTheme='dark'>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
  });

  it.each([
    {},
    { defaultColorScheme: 'unknown', defaultTheme: 'removed' },
    { defaultColorScheme: 4, defaultTheme: {} },
  ])('ignores invalid theme defaults %s', async (app) => {
    const config = document.createElement('script');
    config.id = 'nocobase-runtime-config';
    config.type = 'application/json';
    config.textContent = JSON.stringify({ version: 1, config: { app } });
    document.body.append(config);
    initializeTheme(
      '/crm/',
      themePresets.map(({ id }) => id),
    );
    render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
  });

  it('follows the system theme and persists explicit changes', async () => {
    render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('dark');
      expect(screen.getByTestId('theme')).toHaveTextContent('system');
      expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }));

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('light');
      expect(document.documentElement).not.toHaveClass('dark');
      expect(localStorage.getItem('nocobase:crm:theme:color-scheme')).toBe(
        'light',
      );
      expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
    });
  });

  it('selects presets independently, restores them and ignores another app', async () => {
    localStorage.setItem('nocobase:crm:theme:preset', 'modern-minimal');
    render(
      <AppThemeProvider>
        <PresetProbe />
      </AppThemeProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Use the default preset' }),
    );
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('nocobase:crm:theme:preset')).toBe('default');
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'nocobase:erp:theme:preset',
        newValue: 'modern-minimal',
      }),
    );
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'nocobase:crm:theme:preset',
        newValue: 'modern-minimal',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('preset')).toHaveTextContent('modern-minimal'),
    );
    expect(document.documentElement).toHaveAttribute(
      'data-theme',
      'modern-minimal',
    );
  });

  it('restores a saved preset and resets both selections when storage is cleared', async () => {
    localStorage.setItem('nocobase:crm:theme:preset', 'modern-minimal');
    localStorage.setItem('nocobase:crm:theme:color-scheme', 'light');
    render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute(
        'data-theme',
        'modern-minimal',
      ),
    );
    expect(document.documentElement).toHaveClass('light');
    localStorage.clear();
    fireEvent(window, new StorageEvent('storage', { key: null }));
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
  });

  it('keeps selections usable when browser storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(
      <AppThemeProvider>
        <PresetProbe />
      </AppThemeProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Use the modern-minimal preset' }),
    );
    expect(document.documentElement).toHaveAttribute(
      'data-theme',
      'modern-minimal',
    );
  });

  it('syncs valid modes, normalizes invalid modes and removed presets', async () => {
    render(
      <AppThemeProvider>
        <PresetProbe />
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Use the modern-minimal preset' }),
    );
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'nocobase:crm:theme:color-scheme',
        newValue: 'light',
      }),
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('light'));
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'nocobase:crm:theme:preset',
        newValue: 'removed',
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('preset')).toHaveTextContent('default'),
    );
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'nocobase:crm:theme:color-scheme',
        newValue: 'invalid',
      }),
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(screen.getByTestId('theme')).toHaveTextContent('system');
  });
});

function ThemeProbe(): ReactElement {
  const { resolvedTheme, setTheme, theme } = useTheme();

  return (
    <>
      <span data-testid='theme'>{theme}</span>
      <span data-testid='resolved-theme'>{resolvedTheme}</span>
      <button type='button' onClick={() => setTheme('light')}>
        Use light theme
      </button>
    </>
  );
}

function PresetProbe(): ReactElement {
  const { preset, setPreset } = useThemePreset();

  return (
    <>
      <span data-testid='preset'>{preset}</span>
      <button type='button' onClick={() => setPreset('default')}>
        Use the default preset
      </button>
      <button type='button' onClick={() => setPreset('modern-minimal')}>
        Use the modern-minimal preset
      </button>
    </>
  );
}
