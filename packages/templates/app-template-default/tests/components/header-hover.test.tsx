import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeModeToggle } from '../../client/theme/theme-mode-toggle';
import { AppThemeProvider } from '../../client/theme/theme-provider';
import { UserMenu } from '../../client/layouts/components/user-menu';

// Session requests belong to the authentication tests.
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'operator', name: 'Operator' } },
    isPending: false,
  }),
}));
// Language selection has its own integration tests with the real i18n runtime.
vi.mock('../../client/layouts/components/language-switcher.js', () => ({
  LanguageSwitcher: () => null,
}));

beforeEach(() => {
  vi.stubGlobal('APP_BASE_PATH', '/crm/');
  // jsdom does not implement the media queries used by the real theme provider.
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
});

const panels = [['Open account menu', UserMenu, 'menu']] as const;

it.each(panels)(
  'opens and closes %s on hover',
  async (label, Component, role) => {
    const user = userEvent.setup();
    render(
      <AppThemeProvider>
        <Component />
      </AppThemeProvider>,
    );
    const trigger = screen.getByRole('button', { name: label });

    await user.hover(trigger);
    const panel = screen.getByRole(role);
    expect(trigger).not.toHaveAttribute('title');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    // Supply the destination because user-event does not set relatedTarget.
    fireEvent.mouseLeave(trigger, { relatedTarget: panel });
    fireEvent.mouseEnter(panel, { relatedTarget: trigger });
    fireEvent.mouseMove(panel);
    expect(panel).toBeVisible();

    fireEvent.mouseLeave(panel, { relatedTarget: document.body });
    fireEvent.mouseMove(document.body, { clientX: 1000, clientY: 1000 });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
);

it.each(panels)(
  'opens %s by keyboard and closes with Escape',
  async (label, Component, role) => {
    const user = userEvent.setup();
    render(
      <AppThemeProvider>
        <Component />
      </AppThemeProvider>,
    );
    const trigger = screen.getByRole('button', { name: label });

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole(role)).toBeVisible();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  },
);

// The color mode is a one-click action, not a panel: it switches the mode in place and never opens a surface.
it('switches the color mode from the header toggle', async () => {
  const user = userEvent.setup();
  render(
    <AppThemeProvider>
      <ThemeModeToggle />
    </AppThemeProvider>,
  );
  const toggle = screen.getByRole('button', {
    name: 'Switch between light and dark',
  });
  expect(toggle).not.toHaveAttribute('title');

  await user.click(toggle);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(document.documentElement).toHaveClass('dark');
  expect(localStorage.getItem('nocobase:crm:theme:color-scheme')).toBe('dark');
});
