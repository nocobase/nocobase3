import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import locales from '../../client/locales/index.js';
import ThemePage from '../../client/pages/settings/theme/index.tsx';
import { AppThemeProvider } from '../../client/theme/index.ts';

// The test pins a registry of its own. The page exists for a registry an application grows to dozens, so the test
// drives a long one and swaps the list per case instead of reaching into the page for a knob it does not have.
const registry = vi.hoisted(() => ({
  presets: [] as { id: string; labelKey: string }[],
}));

vi.mock('../../client/theme/theme-presets', () => ({
  defaultThemePreset: 'default',
  themePresets: registry.presets,
}));

const BUILT_IN = [
  { id: 'default', labelKey: 'appearance.themes.default' },
  { id: 'modern-minimal', labelKey: 'appearance.themes.modern-minimal' },
];

const CROWDED = Array.from({ length: 38 }, (_, index) => {
  const id = `theme-${String(index + 1).padStart(2, '0')}`;
  return { id, labelKey: `appearance.themes.${id}` };
});

function setRegistry(
  presets: readonly { id: string; labelKey: string }[],
): void {
  registry.presets.splice(0, registry.presets.length, ...presets);
}

async function renderPage(locale = 'en-US') {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test-app',
  });
  runtime.registerApplicationNamespace('test-app', locales);
  await runtime.init(locale);
  return render(
    <I18nProvider runtime={runtime}>
      <AppThemeProvider>
        <ThemePage />
      </AppThemeProvider>
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('APP_BASE_PATH', '/crm/');
  setRegistry([...BUILT_IN, ...CROWDED]);
  localStorage.clear();
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-theme');
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
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-theme');
});

describe('settings theme page', () => {
  it.each([
    ['en-US', 'Theme', 'Default', 'Modern Minimal'],
    ['zh-CN', '主题', '默认', '现代极简'],
  ])(
    'lists every registered theme in the language it is read in (%s)',
    async (locale, title, active, other) => {
      await renderPage(locale);

      expect(
        screen.getByRole('radiogroup', { name: title }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: title })).toBeVisible();
      expect(screen.getByRole('radio', { name: active })).toBeChecked();
      expect(screen.getByRole('radio', { name: other })).not.toBeChecked();
      // Every registry entry gets a card, not just the ones that fit above the fold.
      expect(screen.getAllByRole('radio')).toHaveLength(40);
      expect(screen.getByRole('radio', { name: 'theme-38' })).toBeVisible();
      expect(screen.getAllByTestId('theme-selected-indicator')).toHaveLength(1);
    },
  );

  it('persists a newly selected theme and applies it to the document', async () => {
    await renderPage();

    await userEvent.click(
      screen.getByRole('radio', { name: 'Modern Minimal' }),
    );

    expect(localStorage.getItem('nocobase:crm:theme:preset')).toBe(
      'modern-minimal',
    );
    expect(document.documentElement).toHaveAttribute(
      'data-theme',
      'modern-minimal',
    );
    expect(screen.getByRole('radio', { name: 'Modern Minimal' })).toBeChecked();
    expect(screen.getAllByTestId('theme-selected-indicator')).toHaveLength(1);
  });

  it('searches a short registry too, and reports what it cannot find', async () => {
    setRegistry(BUILT_IN);

    await renderPage();
    const search = screen.getByRole('searchbox', { name: 'Search themes' });

    expect(screen.getAllByRole('radio')).toHaveLength(2);

    await userEvent.type(search, 'minimal');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Modern Minimal' })).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, 'zzz');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('No theme matches “zzz”.')).toBeVisible();
  });

  it('filters by theme name and by theme id, and restores the grid when cleared', async () => {
    await renderPage();
    const search = screen.getByRole('searchbox', { name: 'Search themes' });

    await userEvent.type(search, 'minimal');
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Modern Minimal' })).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, 'THEME-0');
    expect(screen.getAllByRole('radio')).toHaveLength(9);

    await userEvent.clear(search);
    expect(screen.getAllByRole('radio')).toHaveLength(40);
  });

  it('explains an empty result instead of rendering an empty grid', async () => {
    await renderPage();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search themes' }),
      'zzz',
    );

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('No theme matches “zzz”.')).toBeVisible();
  });
});
