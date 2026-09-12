import { initializeTheme } from '../../client/theme/theme-preferences';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AppThemeProvider,
  ThemeSettings,
  useTheme,
} from '../../client/theme/index.ts';

describe('app client theme', () => {
  it('falls back from the removed Ant Design preset without changing mode', async () => {
    localStorage.setItem('nocobase:crm:theme:preset', 'ant-design');
    localStorage.setItem('nocobase:crm:theme:color-scheme', 'light');
    render(
      <AppThemeProvider>
        <ThemeSettings />
      </AppThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(
      screen.queryByRole('radio', { name: 'Ant-design' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked();
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    expect(document.documentElement).toHaveClass('light');
  });
  it('omits Ocean and falls back from its saved ID to Default', async () => {
    localStorage.setItem('nocobase:crm:theme:preset', 'ocean');
    render(
      <AppThemeProvider>
        <ThemeSettings />
      </AppThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    expect(
      screen.queryByRole('radio', { name: 'Ocean' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Default' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Compact' })).toBeInTheDocument();
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
  });

  it.each([
    [undefined, undefined, 'light', 'compact'],
    ['dark', 'default', 'dark', 'default'],
    ['system', 'removed', 'dark', 'compact'],
    ['invalid', 'default', 'light', 'default'],
  ])(
    'uses configured defaults with saved mode %s and preset %s',
    async (savedMode, savedPreset, mode, preset) => {
      const config = document.createElement('script');
      config.id = 'nocobase-runtime-config';
      config.type = 'application/json';
      config.textContent = JSON.stringify({
        version: 1,
        config: {
          app: { defaultColorScheme: 'light', defaultTheme: 'compact' },
        },
      });
      document.body.append(config);
      if (savedMode)
        localStorage.setItem('nocobase:crm:theme:color-scheme', savedMode);
      if (savedPreset)
        localStorage.setItem('nocobase:crm:theme:preset', savedPreset);
      initializeTheme('/crm/', ['default', 'compact']);
      expect(document.documentElement).toHaveClass(mode);
      expect(document.documentElement).toHaveAttribute('data-theme', preset);
      render(
        <AppThemeProvider>
          <ThemeProbe />
        </AppThemeProvider>,
      );
      await waitFor(() => expect(document.documentElement).toHaveClass(mode));
      expect(document.documentElement).toHaveAttribute('data-theme', preset);
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
      expect(document.documentElement).toHaveAttribute('data-theme', 'compact');
      expect(
        localStorage.getItem('nocobase:crm:theme:color-scheme'),
      ).toBeNull();
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
      config: { app: { defaultColorScheme: 'light', defaultTheme: 'compact' } },
    });
    document.body.append(config);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    initializeTheme('/crm/', ['default', 'compact']);
    expect(document.documentElement).toHaveClass('light');
    const { unmount } = render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('light'));
    expect(document.documentElement).toHaveAttribute('data-theme', 'compact');
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
    initializeTheme('/crm/', ['default', 'compact']);
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
    render(
      <AppThemeProvider>
        <ThemeSettings />
      </AppThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    await userEvent.click(
      await screen.findByRole('radio', { name: 'Compact' }),
    );
    expect(document.documentElement).toHaveAttribute('data-theme', 'compact');
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('nocobase:crm:theme:preset')).toBe('compact');
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).toHaveClass('light');
    expect(document.documentElement).toHaveAttribute('data-theme', 'compact');
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'nocobase:erp:theme:preset',
        newValue: 'default',
      }),
    );
    expect(document.documentElement).toHaveAttribute('data-theme', 'compact');
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'nocobase:crm:theme:preset',
        newValue: 'default',
      }),
    );
    expect(await screen.findByRole('radio', { name: 'Default' })).toBeChecked();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Appearance' })).toHaveFocus(),
    );
  });

  it('restores a saved preset and resets both selections when storage is cleared', async () => {
    localStorage.setItem('nocobase:crm:theme:preset', 'compact');
    localStorage.setItem('nocobase:crm:theme:color-scheme', 'light');
    render(
      <AppThemeProvider>
        <ThemeProbe />
      </AppThemeProvider>,
    );
    await waitFor(() =>
      expect(document.documentElement).toHaveAttribute('data-theme', 'compact'),
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
        <ThemeSettings />
      </AppThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'compact');
    expect(document.documentElement).toHaveClass('light');
  });

  it('syncs valid modes, normalizes invalid modes and removed presets', async () => {
    render(
      <AppThemeProvider>
        <ThemeSettings />
      </AppThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Appearance' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Compact' }));
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
    expect(document.documentElement).toHaveAttribute('data-theme', 'default');
    fireEvent(
      window,
      new StorageEvent('storage', {
        key: 'nocobase:crm:theme:color-scheme',
        newValue: 'invalid',
      }),
    );
    await waitFor(() => expect(document.documentElement).toHaveClass('dark'));
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
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
