import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AppThemeProvider,
  ThemeSettings,
  useTheme,
} from '../../client/theme/index.ts';

describe('app client theme', () => {
  beforeEach(() => {
    localStorage.clear();
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
    localStorage.clear();
    document.documentElement.removeAttribute('class');
    document.documentElement.removeAttribute('style');
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
      expect(localStorage.getItem('nocobase-theme')).toBe('light');
      expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
    });
  });

  it('provides a top-right theme toggle', async () => {
    render(
      <AppThemeProvider>
        <ThemeSettings />
      </AppThemeProvider>,
    );

    const toggle = screen.getByRole('button', {
      name: 'Switch to light theme',
    });

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(document.documentElement).toHaveClass('light');
      expect(localStorage.getItem('nocobase-theme')).toBe('light');
      expect(
        screen.getByRole('button', { name: 'Switch to dark theme' }),
      ).toBeVisible();
    });
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
