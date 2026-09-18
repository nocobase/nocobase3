import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ThemeSettings } from '../../client/theme/theme-settings';
import { UserMenu } from '../../client/shell/user-menu';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (_key: string, options: { defaultValue: string }) =>
      options.defaultValue,
  }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('../../client/theme/theme-context', () => ({
  useThemePreset: () => ({ preset: 'default', setPreset: vi.fn() }),
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    client: { signOut: vi.fn() },
    session: {
      user: { id: 'operator', name: 'Operator', email: 'operator@example.com' },
    },
    isPending: false,
    refresh: vi.fn(),
  }),
}));
vi.mock('../../client/shell/language-switcher.js', () => ({
  LanguageSwitcher: () => null,
}));

describe('header hover panels', () => {
  it.each([
    ['Appearance', ThemeSettings, 'dialog'],
    ['Open account menu', UserMenu, 'menu'],
  ] as const)(
    'opens %s immediately on hover and keeps its panel interactive',
    async (label, Component, role) => {
      const user = userEvent.setup();
      render(<Component />);
      const trigger = screen.getByRole('button', { name: label });
      await user.hover(trigger);
      const panel = screen.getByRole(role);
      expect(trigger).not.toHaveAttribute('title');
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      await user.hover(panel);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      expect(panel).toBeVisible();
      if (role === 'menu')
        expect(screen.getByText('operator@example.com')).toBeVisible();
      else expect(screen.getByRole('radio', { name: 'Dark' })).toBeVisible();
      await user.unhover(panel);
      await waitFor(() =>
        expect(screen.queryByRole(role)).not.toBeInTheDocument(),
      );
      await user.click(trigger);
      expect(await screen.findByRole(role)).toBeVisible();
      await user.keyboard('{Escape}');
      await waitFor(() =>
        expect(screen.queryByRole(role)).not.toBeInTheDocument(),
      );
      act(() => trigger.focus());
      await user.keyboard('{Enter}');
      expect(await screen.findByRole(role)).toBeVisible();
    },
  );
});
