import type { AppClientRegisteredSetting } from '@nocobase/app-client/plugins';
import {
  Refine,
  type AccessControlProvider,
  type AuthProvider,
} from '@refinedev/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRouter } from '../../client/routing/app-router.tsx';
import { groupSettings } from '../../client/settings/index.ts';
import { AppThemeProvider } from '../../client/theme/index.ts';

describe('settings centre', () => {
  beforeEach(() => {
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

  it('renders the requested setting with a grouped navigation of the rest', async () => {
    renderSettings('/settings/authorization/default-access');

    expect(await screen.findByText('Default Access page')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Settings' })).toBeVisible();
    expect(screen.getByText('Authorization')).toBeVisible();
    expect(screen.getByText('Workflow')).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: 'Default Access' })[0],
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getAllByRole('link', { name: 'Permission Sets' })[0],
    ).not.toHaveAttribute('aria-current');
    expect(
      screen.getAllByRole('link', { name: 'Back to app' })[0],
    ).toHaveAttribute('href', '/');
  });

  it('redirects /settings itself to the first setting the user can open', async () => {
    renderSettings('/settings');

    expect(await screen.findByText('Permission Sets page')).toBeVisible();
  });

  it('sends an unknown settings path to the first accessible setting', async () => {
    renderSettings('/settings/nothing/here');

    expect(await screen.findByText('Permission Sets page')).toBeVisible();
  });

  it('hides a setting the access control provider denies, and does not land on it', async () => {
    renderSettings('/settings/authorization/permission-sets', {
      can: async ({ resource }) => ({
        can: resource !== 'authorization.settings.permission-sets',
      }),
    });

    // The denied setting is neither reachable directly nor listed, so the redirect falls through to the next one.
    expect(await screen.findByText('Default Access page')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Permission Sets' }),
    ).not.toBeInTheDocument();
  });

  it('treats a provider that throws as a denial', async () => {
    renderSettings('/settings/authorization/permission-sets', {
      can: async ({ resource }) => {
        if (resource === 'authorization.settings.permission-sets') {
          throw new Error('provider unavailable');
        }
        return { can: true };
      },
    });

    expect(await screen.findByText('Default Access page')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Permission Sets' }),
    ).not.toBeInTheDocument();
  });

  it('explains itself when every setting is denied', async () => {
    renderSettings(
      '/settings',
      { can: async () => ({ can: false }) },
      SETTINGS.filter((setting) => setting.access !== undefined),
    );

    expect(
      await screen.findByRole('heading', { name: 'No settings available' }),
    ).toBeVisible();
  });

  it('leaves a setting without an access rule visible even when the provider denies everything', async () => {
    renderSettings('/settings', { can: async () => ({ can: false }) });

    // `workflow/general` declares no access rule, so reaching the settings centre is the only check it has.
    expect(await screen.findByText('Workflow General page')).toBeVisible();
  });

  it('keeps ungoverned settings visible when no plugin registered a provider', async () => {
    renderSettings('/settings', undefined, [
      createSetting('general', 'General', 'App'),
    ]);

    expect(await screen.findByText('General page')).toBeVisible();
  });

  it('navigates from the small-screen select without reloading the page', async () => {
    renderSettings('/settings/authorization/permission-sets');
    await screen.findByText('Permission Sets page');

    fireEvent.change(screen.getByLabelText('Settings page'), {
      target: { value: '/settings/workflow/general' },
    });

    expect(await screen.findByText('Workflow General page')).toBeVisible();
  });

  it('groups settings by group, preserving registration order within each', () => {
    expect(
      groupSettings([
        createSetting('a', 'A', 'First'),
        createSetting('b', 'B', 'Second'),
        createSetting('c', 'C', 'First'),
      ]).map((group) => [
        group.name,
        group.settings.map((setting) => setting.id),
      ]),
    ).toEqual([
      ['First', ['a', 'c']],
      ['Second', ['b']],
    ]);
  });
});

const SETTINGS: readonly AppClientRegisteredSetting[] = [
  createSetting(
    'authorization/permission-sets',
    'Permission Sets',
    'Authorization',
    'authorization.settings.permission-sets',
  ),
  createSetting(
    'authorization/default-access',
    'Default Access',
    'Authorization',
    'authorization.settings.default-access',
  ),
  createSetting('workflow/general', 'Workflow General', 'Workflow'),
];

function renderSettings(
  initialEntry: string,
  accessControlProvider?: AccessControlProvider,
  settings: readonly AppClientRegisteredSetting[] = SETTINGS,
): void {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppThemeProvider>
        <Refine
          accessControlProvider={accessControlProvider}
          authProvider={createAuthProvider()}
          dataProvider={{
            getList: vi.fn(),
            getMany: vi.fn(),
            getOne: vi.fn(),
            create: vi.fn(),
            createMany: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
            deleteOne: vi.fn(),
            deleteMany: vi.fn(),
            getApiUrl: vi.fn(),
            custom: vi.fn(),
          }}
          options={{ disableTelemetry: true }}
        >
          <AppRouter clientRoutes={[]} clientSettings={settings} />
        </Refine>
      </AppThemeProvider>
    </MemoryRouter>,
  );
}

function createAuthProvider(): AuthProvider {
  return {
    check: async () => ({ authenticated: true }),
    getIdentity: async () => ({ id: 1, fullName: 'Alice' }),
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue({ success: true }),
    onError: async (error) => ({ error }),
  };
}

function createSetting(
  id: string,
  title: string,
  group: string,
  accessResource?: string,
): AppClientRegisteredSetting {
  return {
    ...(accessResource === undefined
      ? {}
      : { access: { resource: accessResource, action: 'read' } }),
    group,
    id,
    packageName: '@nocobase/app-plugin-test',
    pageLoader: async () => ({
      default: (): ReactElement => <h2>{title} page</h2>,
    }),
    path: `/settings/${id}`,
    source: 'plugin',
    title,
  };
}
