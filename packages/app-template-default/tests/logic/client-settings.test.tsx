import type {
  AppClientRegisteredSetting,
  AppClientRegisteredSettingGroup,
  AppClientSettingIcon,
} from '@nocobase/app-client/plugins';
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
import { buildNavEntries } from '../../client/settings/index.ts';
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
    expect(
      screen.getByRole('link', { name: 'Workflow General' }),
    ).toBeVisible();
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

  it('carries the application header controls, without a gear pointing at itself', async () => {
    renderSettings('/settings/authorization/permission-sets');
    await screen.findByText('Permission Sets page');

    expect(
      screen.getByRole('button', { name: /Switch to .* theme/ }),
    ).toBeVisible();
    // The account menu is a real dropdown, so its contents exist only once opened; the trigger carries the name.
    expect(
      await screen.findByRole('button', { name: 'Open account menu' }),
    ).toHaveAttribute('title', 'Alice');
    expect(
      screen.queryByRole('link', { name: 'Settings' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: 'Back to app' })[0],
    ).toHaveAttribute('href', '/');
  });

  it('renders the icon a setting declares, and copes with one that declares none', async () => {
    renderSettings('/settings/authorization/permission-sets');
    await screen.findByText('Permission Sets page');

    const iconOf = (name: string) =>
      screen
        .getAllByRole('link', { name })[0]
        .querySelector('[data-testid="setting-icon"]');

    expect(iconOf('Permission Sets')).toBeInTheDocument();
    expect(iconOf('Default Access')).not.toBeInTheDocument();
  });

  it('opens the group holding the current page and collapses it on demand', async () => {
    renderSettings('/settings/authorization/default-access');
    await screen.findByText('Default Access page');

    const group = screen.getByText('Authorization').closest('details');
    expect(group).toHaveAttribute('open');

    fireEvent.click(screen.getByText('Authorization'));
    expect(group).not.toHaveAttribute('open');
  });

  it('renders an ungrouped page as a flat row rather than a disclosure', async () => {
    renderSettings('/settings/workflow');
    await screen.findByText('Workflow General page');

    const link = screen.getAllByRole('link', { name: 'Workflow General' })[0];
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.closest('details')).toBeNull();
  });

  it('drops a group whose every page the user is denied', async () => {
    renderSettings('/settings', {
      can: async ({ resource }) => ({
        can: !resource?.startsWith('authorization.settings.'),
      }),
    });

    expect(await screen.findByText('Workflow General page')).toBeVisible();
    expect(screen.queryByText('Authorization')).not.toBeInTheDocument();
  });

  it('shows a group icon beside its title', async () => {
    renderSettings('/settings/authorization/default-access');
    await screen.findByText('Default Access page');

    expect(
      screen
        .getByText('Authorization')
        .closest('summary')
        ?.querySelector('[data-testid="setting-icon"]'),
    ).toBeInTheDocument();
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
    renderSettings(
      '/settings',
      undefined,
      [createSetting('general', 'General')],
      [],
    );

    expect(await screen.findByText('General page')).toBeVisible();
  });

  it('navigates from the small-screen select without reloading the page', async () => {
    renderSettings('/settings/authorization/permission-sets');
    await screen.findByText('Permission Sets page');

    fireEvent.change(screen.getByLabelText('Settings page'), {
      target: { value: '/settings/workflow' },
    });

    expect(await screen.findByText('Workflow General page')).toBeVisible();
  });

  it('builds nav entries in declaration order, emitting each group once', () => {
    const first = createSetting('a', 'A', 'g1');
    const second = createSetting('b', 'B');
    const third = createSetting('c', 'C', 'g1');
    const group: AppClientRegisteredSettingGroup = {
      id: 'g1',
      packageName: '@nocobase/app-plugin-test',
      settings: [first, third],
      source: 'plugin',
      title: 'Group One',
    };

    expect(
      buildNavEntries([first, second, third], [group]).map((entry) =>
        entry.kind === 'group'
          ? ['group', entry.group.settings.map((s) => s.id)]
          : ['page', entry.setting.id],
      ),
    ).toEqual([
      ['group', ['a', 'c']],
      ['page', 'b'],
    ]);
  });

  it('renders a page flat when it names a group nobody registered', () => {
    const orphan = createSetting('a', 'A', 'missing');

    expect(buildNavEntries([orphan], [])).toEqual([
      { kind: 'page', setting: orphan },
    ]);
  });
});

const ICON: AppClientSettingIcon = ({ className }) => (
  <svg className={className} data-testid='setting-icon' />
);

const AUTHORIZATION: AppClientRegisteredSettingGroup = {
  icon: ICON,
  id: 'authorization',
  packageName: '@nocobase/app-plugin-test',
  settings: [
    createSetting(
      'permission-sets',
      'Permission Sets',
      'authorization',
      'authorization.settings.permission-sets',
      ICON,
    ),
    createSetting(
      'default-access',
      'Default Access',
      'authorization',
      'authorization.settings.default-access',
    ),
  ],
  source: 'plugin',
  title: 'Authorization',
};

// A group's pages are also in the flat list; that is what the router mounts.
const SETTINGS: readonly AppClientRegisteredSetting[] = [
  ...AUTHORIZATION.settings,
  createSetting('workflow', 'Workflow General'),
];

const GROUPS: readonly AppClientRegisteredSettingGroup[] = [AUTHORIZATION];

function renderSettings(
  initialEntry: string,
  accessControlProvider?: AccessControlProvider,
  settings: readonly AppClientRegisteredSetting[] = SETTINGS,
  groups: readonly AppClientRegisteredSettingGroup[] = GROUPS,
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
          <AppRouter
            clientRoutes={[]}
            clientSettingGroups={groups}
            clientSettings={settings}
          />
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
  groupId?: string,
  accessResource?: string,
  icon?: AppClientSettingIcon,
): AppClientRegisteredSetting {
  return {
    ...(accessResource === undefined
      ? {}
      : { access: { resource: accessResource, action: 'read' } }),
    ...(icon === undefined ? {} : { icon }),
    ...(groupId === undefined ? {} : { groupId }),
    id,
    packageName: '@nocobase/app-plugin-test',
    pageLoader: async () => ({
      default: (): ReactElement => <h2>{title} page</h2>,
    }),
    path:
      groupId === undefined ? `/settings/${id}` : `/settings/${groupId}/${id}`,
    source: 'plugin',
    title,
  };
}
