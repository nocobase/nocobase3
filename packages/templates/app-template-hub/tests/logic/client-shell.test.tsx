import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import {
  Refine,
  type AccessControlProvider,
  type AuthProvider,
  type ResourceProps,
} from '@refinedev/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType, ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRouter } from '../../client/routing/app-router.tsx';
import { AppThemeProvider } from '../../client/theme/index.ts';

describe('application shell', () => {
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

  it('wraps authenticated application pages with navigation and user controls', async () => {
    renderApplication('/', createAuthProvider(true));

    expect(
      await screen.findByRole('navigation', { name: 'Application navigation' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Home' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Application navigation' }),
    ).toHaveClass(
      'bg-sidebar',
      'text-sidebar-foreground',
      'border-sidebar-border',
    );
    // The account menu is a real dropdown, so its contents exist only once opened; the trigger carries the name.
    expect(
      await screen.findByRole('button', { name: 'Open account menu' }),
    ).toHaveAttribute('title', 'Alice');
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Settings' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('AI builds freely.')).toBeVisible();
    expect(screen.getByText('NocoBase Hub v0.0.0')).toBeVisible();
    expect(screen.getByText('Hub console')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'App client is ready' }),
    ).toBeVisible();
  });

  it('collapses and expands the desktop navigation', async () => {
    renderApplication('/', createAuthProvider(true));

    const sidebar = await screen.findByRole('complementary', {
      name: 'Application navigation',
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse navigation' }),
    );
    expect(sidebar).toHaveClass('md:w-16');
    expect(
      screen.getByRole('button', { name: 'Expand navigation' }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));
    expect(sidebar).toHaveClass('md:w-64');
  });

  it('opens and closes the mobile navigation without changing the route', async () => {
    renderApplication('/', createAuthProvider(true));
    await screen.findByRole('navigation', { name: 'Application navigation' });

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(
      screen.getByRole('complementary', { name: 'Application navigation' }),
    ).toHaveClass('translate-x-0');

    fireEvent.click(
      screen.getAllByRole('button', { name: 'Close navigation' })[1],
    );
    expect(
      screen.getByRole('complementary', { name: 'Application navigation' }),
    ).toHaveClass('-translate-x-full');
  });

  it('keeps guest pages outside the application shell', async () => {
    renderApplication('/login', createAuthProvider(false), [
      createRoute('login', '/login', 'guest', GuestPage),
    ]);

    expect(await screen.findByText('Guest login page')).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Application navigation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeVisible();
  });

  it('redirects ordinary App settings paths into the Hub console', async () => {
    renderApplication('/settings/users', createAuthProvider(true), [
      createRoute('apps', '/apps', 'required', ApplicationsPage),
    ]);

    expect(
      await screen.findByRole('heading', { name: 'Applications page' }),
    ).toBeVisible();
  });

  it('shows a protected navigation entry as selected when access is allowed', async () => {
    renderApplication(
      '/users',
      createAuthProvider(true),
      [createRoute('users', '/users', 'required', UsersPage, 'plugin', true)],
      {
        accessControlProvider: {
          can: vi.fn().mockResolvedValue({ can: true }),
        },
        resources: [protectedUsersResource()],
      },
    );

    expect(
      await screen.findByRole('link', { name: 'User management' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Users page')).toBeVisible();
  });

  it('never discloses a protected navigation entry when access is denied', async () => {
    const can = vi.fn().mockResolvedValue({ can: false });
    renderApplication(
      '/users',
      createAuthProvider(true),
      [createRoute('users', '/users', 'required', UsersPage, 'plugin', true)],
      {
        accessControlProvider: { can },
        resources: [protectedUsersResource()],
      },
    );

    expect(
      screen.queryByRole('link', { name: 'User management' }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Access denied' }),
    ).toBeVisible();
    expect(can).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'users', action: 'access' }),
    );
    expect(
      screen.queryByRole('link', { name: 'User management' }),
    ).not.toBeInTheDocument();
  });

  it('orders Hub navigation and puts users before roles', async () => {
    renderApplication(
      '/users',
      createAuthProvider(true),
      [
        createRoute('applications', '/apps', 'required', ApplicationsPage),
        createRoute('users', '/users', 'required', UsersPage),
        createRoute('roles', '/roles', 'required', RolesPage),
      ],
      {
        accessControlProvider: {
          can: vi.fn().mockResolvedValue({ can: true }),
        },
        resources: hubResources(),
      },
    );

    const navigation = await screen.findByRole('navigation', {
      name: 'Application navigation',
    });
    await waitFor(() =>
      expect(
        Array.from(navigation.querySelectorAll('a')).map((link) =>
          link.textContent?.trim(),
        ),
      ).toEqual(['Applications', 'User management', 'Roles & permissions']),
    );
  });
});

function renderApplication(
  initialEntry: string,
  authProvider: AuthProvider,
  routes: readonly AppClientRegisteredRoute[] = [],
  options: {
    readonly accessControlProvider?: AccessControlProvider;
    readonly resources?: readonly ResourceProps[];
  } = {},
): void {
  const clientRoutes = [
    createRoute('home', '/', 'required', HomePage, 'application'),
    ...routes,
  ];
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppThemeProvider>
        <Refine
          accessControlProvider={options.accessControlProvider}
          authProvider={authProvider}
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
          resources={[...(options.resources ?? [])]}
        >
          <AppRouter
            clientDevRouteGroups={[]}
            clientDevRoutes={[]}
            clientRoutes={clientRoutes}
            clientSettingGroups={[]}
            clientSettings={[]}
          />
        </Refine>
      </AppThemeProvider>
    </MemoryRouter>,
  );
}

function createAuthProvider(authenticated: boolean): AuthProvider {
  return {
    check: async () => ({ authenticated }),
    getIdentity: async () =>
      authenticated
        ? {
            email: 'alice@example.com',
            fullName: 'Alice',
            id: 1,
          }
        : null,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue({ success: true }),
    onError: async (error) => ({ error }),
  };
}

function createRoute(
  name: string,
  path: string,
  auth: AppClientRegisteredRoute['auth'],
  Component: ComponentType,
  source: AppClientRegisteredRoute['source'] = 'plugin',
  protectedRoute: boolean = false,
): AppClientRegisteredRoute {
  const packageName =
    source === 'application'
      ? '@nocobase/app-template-hub'
      : '@nocobase/app-plugin-test';
  return {
    auth,
    componentLoader: async () => ({ default: Component }),
    id: `${packageName}:${name}`,
    name,
    packageName,
    path,
    source,
    ...(protectedRoute ? { access: { resource: name, action: 'access' } } : {}),
  };
}

function protectedUsersResource(): ResourceProps {
  return {
    name: 'users',
    list: '/users',
    meta: {
      access: { resource: 'users', action: 'access' },
      label: 'User management',
    },
  };
}

function hubResources(): ResourceProps[] {
  const access = { resource: 'users', action: 'access' };
  return [
    {
      name: 'hub',
      list: '/apps',
      meta: { label: 'Applications', order: 10 },
    },
    {
      name: 'hub-user-access',
      meta: { access, label: 'Users & permissions', order: 20 },
    },
    {
      name: 'hub-roles',
      list: '/roles',
      meta: {
        access,
        label: 'Roles & permissions',
        order: 20,
        parent: 'hub-user-access',
      },
    },
    {
      name: 'users',
      list: '/users',
      meta: {
        access,
        label: 'User management',
        order: 10,
        parent: 'hub-user-access',
      },
    },
  ];
}

function HomePage(): ReactElement {
  return <h2>App client is ready</h2>;
}

function GuestPage(): ReactElement {
  return <div>Guest login page</div>;
}

function UsersPage(): ReactElement {
  return <div>Users page</div>;
}

function ApplicationsPage(): ReactElement {
  return <h2>Applications page</h2>;
}

function RolesPage(): ReactElement {
  return <h2>Roles page</h2>;
}
