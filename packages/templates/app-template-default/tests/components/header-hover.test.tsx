import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeSettings } from '../../client/theme/theme-settings';
import { UserMenu } from '../../client/shell/user-menu';

const { signOut, changeLocale } = vi.hoisted(() => ({
  signOut: vi.fn(async () => ({ error: null })),
  changeLocale: vi.fn(),
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (_key: string, options: { defaultValue: string }) =>
      options.defaultValue,
  }),
}));
vi.mock('next-themes', () => ({
  useTheme: () => {
    const [theme, setTheme] = useState('light');
    return { theme, setTheme };
  },
}));
vi.mock('../../client/theme/theme-context', () => ({
  useThemePreset: () => {
    const [preset, setPreset] = useState('default');
    return { preset, setPreset };
  },
}));
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    client: { signOut },
    session: {
      user: { id: 'operator', name: 'Operator', email: 'operator@example.com' },
    },
    isPending: false,
    refresh: vi.fn(),
  }),
}));
vi.mock('@nocobase/app-plugin-i18n/client', () => ({
  useAppLocale: () => {
    const [locale, setLocale] = useState('en-US');
    return {
      locale,
      switching: false,
      locales: [
        { locale: 'en-US', label: 'English' },
        { locale: 'zh-CN', label: '中文' },
      ],
      setLocale: async (value: string) => {
        changeLocale(value);
        setLocale(value);
        return { fallback: false };
      },
    };
  },
}));

describe('header hover panels', () => {
  it.each([
    ['Appearance', ThemeSettings, 'dialog'],
    ['Open account menu', UserMenu, 'menu'],
  ] as const)(
    'opens and closes %s immediately on hover while keeping its panel interactive',
    async (label, Component, role) => {
      const user = userEvent.setup();
      render(<Component />);
      const trigger = screen.getByRole('button', { name: label });
      await user.hover(trigger);
      const panel = screen.getByRole(role);
      expect(trigger).not.toHaveAttribute('title');
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      // Provide the real destination: user-event's synthetic leave has no relatedTarget.
      fireEvent.mouseLeave(trigger, { relatedTarget: panel });
      fireEvent.mouseEnter(panel, { relatedTarget: trigger });
      fireEvent.mouseMove(panel);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
      });
      expect(panel).toBeVisible();
      if (role === 'menu')
        expect(screen.getByText('operator@example.com')).toBeVisible();
      else expect(screen.getByRole('radio', { name: 'Dark' })).toBeVisible();
      fireEvent.mouseLeave(panel, { relatedTarget: document.body });
      fireEvent.mouseMove(document.body, { clientX: 1000, clientY: 1000 });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
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

describe('closing after changing preferences', () => {
  it.each(['hover', 'click'] as const)(
    'uses default dismissal after changing appearance (%s)',
    async (method) => {
      const user = userEvent.setup();
      render(
        <>
          <ThemeSettings />
          <button>Outside</button>
        </>,
      );
      const trigger = screen.getByRole('button', { name: 'Appearance' });
      if (method === 'click') await user.click(trigger);
      else await user.hover(trigger);
      const panel = screen.getByRole('dialog');
      fireEvent.mouseLeave(trigger, { relatedTarget: panel });
      fireEvent.mouseEnter(panel, { relatedTarget: trigger });
      fireEvent.mouseMove(panel);
      const dark = screen.getByRole('radio', { name: 'Dark' });
      // Click from within the popup; user-event does not preserve relatedTarget between its synthetic hover targets.
      fireEvent.pointerDown(dark, { pointerType: 'mouse' });
      act(() => dark.focus());
      fireEvent.click(dark);
      expect(dark).toBeChecked();
      const compact = screen.getByRole('radio', { name: 'Compact' });
      fireEvent.pointerDown(compact, { pointerType: 'mouse' });
      fireEvent.click(compact);
      expect(compact).toBeChecked();
      fireEvent.mouseLeave(panel, { relatedTarget: document.body });
      fireEvent.mouseMove(document.body, { clientX: 1000, clientY: 1000 });
      expect(trigger).toHaveAttribute(
        'aria-expanded',
        method === 'click' ? 'true' : 'false',
      );
      if (method === 'click') {
        await user.click(screen.getByRole('button', { name: 'Outside' }));
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
      }
    },
  );
  it.each(['hover', 'click'] as const)(
    'closes account immediately after selecting a language (%s)',
    async (method) => {
      const user = userEvent.setup();
      render(<UserMenu />);
      const trigger = screen.getByRole('button', { name: 'Open account menu' });
      if (method === 'click') await user.click(trigger);
      else await user.hover(trigger);
      const panel = screen.getByRole('menu');
      fireEvent.mouseLeave(trigger, { relatedTarget: panel });
      fireEvent.mouseEnter(panel, { relatedTarget: trigger });
      fireEvent.mouseMove(panel);
      const language = screen.getByRole('menuitem', { name: /Language/ });
      fireEvent.mouseEnter(language);
      fireEvent.mouseMove(language);
      fireEvent.pointerDown(language, { pointerType: 'mouse' });
      fireEvent.mouseDown(language, { button: 0 });
      fireEvent.click(language);
      const chinese = await screen.findByRole('menuitemradio', {
        name: '中文',
      });
      const submenu = chinese.closest('[role=menu]')!;
      fireEvent.mouseLeave(panel, { relatedTarget: submenu });
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      fireEvent.mouseEnter(submenu, { relatedTarget: panel });
      fireEvent.mouseMove(submenu);
      fireEvent.pointerDown(chinese, { pointerType: 'mouse' });
      fireEvent.click(chinese);
      await waitFor(() =>
        expect(trigger).toHaveAttribute('aria-expanded', 'false'),
      );
      await waitFor(() =>
        expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
      );
      expect(changeLocale).toHaveBeenCalledWith('zh-CN');
    },
  );
});

it('keeps keyboard theme selection available until Escape', async () => {
  const user = userEvent.setup();
  render(<ThemeSettings />);
  const trigger = screen.getByRole('button', { name: 'Appearance' });
  act(() => trigger.focus());
  await user.keyboard('{Enter}');
  const dark = screen.getByRole('radio', { name: 'Dark' });
  act(() => dark.focus());
  await user.keyboard(' ');
  expect(dark).toBeChecked();
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{Escape}');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

it('keeps Sign out reachable when the language submenu shields the parent menu', async () => {
  const user = userEvent.setup();
  render(<UserMenu />);
  const trigger = screen.getByRole('button', { name: 'Open account menu' });
  await user.hover(trigger);
  const panel = screen.getByRole('menu');
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 100, 256, 160),
  );
  fireEvent.mouseLeave(trigger, { relatedTarget: panel });
  fireEvent.mouseEnter(panel, { relatedTarget: trigger });
  fireEvent.mouseMove(panel, { clientX: 220, clientY: 150 });
  const language = screen.getByRole('menuitem', { name: /Language/ });
  fireEvent.mouseEnter(language);
  fireEvent.mouseMove(language);
  await screen.findByRole('menuitemradio', { name: '中文' });
  expect(panel).toHaveStyle({ pointerEvents: 'none' });
  // The submenu's safe corridor retargets the pointer to the page even though
  // its coordinates are still over the parent's Sign out row.
  fireEvent.mouseLeave(panel, {
    relatedTarget: document.body,
    clientX: 240,
    clientY: 240,
  });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  // Moving down dismisses the submenu, then the parent receives the pointer again.
  fireEvent.mouseLeave(language, {
    relatedTarget: document.body,
    clientX: 240,
    clientY: 240,
  });
  fireEvent.mouseMove(document.body, { clientX: 240, clientY: 240 });
  await waitFor(() =>
    expect(language).toHaveAttribute('aria-expanded', 'false'),
  );
  fireEvent.mouseEnter(panel, {
    relatedTarget: document.body,
    clientX: 240,
    clientY: 240,
  });
  const signOutItem = screen.getByRole('menuitem', { name: 'Sign out' });
  fireEvent.mouseMove(signOutItem, { clientX: 240, clientY: 240 });
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(signOutItem).toBeVisible();
  fireEvent.click(signOutItem);
  await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
