import {
  ClientApplicationContext,
  createAppI18nRuntime,
  type ClientApplication,
} from '@nocobase/app-client';
import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { I18nProvider } from '@nocobase/i18n/client';
import type { I18nRuntime } from '@nocobase/i18n';
import {
  AuthenticationProvider,
  authenticationClientToken,
} from '@nocobase/app-plugin-authentication/client';
import {
  Refine,
  type AccessControlProvider,
  type AuthProvider,
} from '@refinedev/core';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ComponentType, ReactElement } from 'react';
import { Outlet, MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import clientPlugins from '../../client/plugins.ts';
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
      await screen.findByRole('heading', { name: 'App client is ready' }),
    ).toBeVisible();
  });

  it.each([true, false])(
    'shows the Settings entry only when a page is accessible (%s)',
    async (allowed) => {
      const can = vi.fn(async ({ resource }: { resource?: string }) => ({
        can: resource !== 'preferences' || allowed,
      }));
      renderApplication('/', createAuthProvider(true), [], {
        accessControlProvider: { can },
        settingsRouteTree: [
          createRoute(
            'preferences',
            '/settings/preferences',
            'required',
            () => <h2>Preferences</h2>,
            'plugin',
            'Preferences',
            true,
          ),
        ],
      });
      await screen.findByRole('heading', { name: 'App client is ready' });
      await waitFor(() =>
        expect(can).toHaveBeenCalledWith(
          expect.objectContaining({
            resource: 'preferences',
            action: 'access',
          }),
        ),
      );
      if (allowed) {
        expect(
          await screen.findByRole('link', { name: 'Settings' }),
        ).toBeVisible();
      } else {
        expect(
          screen.queryByRole('link', { name: 'Settings' }),
        ).not.toBeInTheDocument();
      }
    },
  );

  it('renders nested pages through manual outlets and selects the nearest menu ancestor', async () => {
    const child = createRoute('detail', '/orders/42', 'required', () => (
      <h3>Order detail</h3>
    ));
    const parent = {
      ...createRoute('orders', '/orders', 'required', () => (
        <>
          <h2>Orders layout</h2>
          <Outlet />
        </>
      )),
      navigation: { title: 'Orders' },
      children: [child],
    };
    renderApplication('/orders/42', createAuthProvider(true), [parent]);
    expect(await screen.findByText('Order detail')).toBeVisible();
    expect(screen.getByText('Orders layout')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Orders' }).querySelector('svg'),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('keeps a parent page link clickable independently of its menu disclosure', async () => {
    const child = {
      ...createRoute('reports', '/orders/reports', 'required', () => (
        <h3>Reports page</h3>
      )),
      navigation: { title: 'Reports' },
    };
    const parent = {
      ...createRoute('orders', '/orders', 'required', () => (
        <>
          <h2>Orders layout</h2>
          <Outlet />
        </>
      )),
      navigation: { title: 'Orders' },
      children: [child],
    };
    renderApplication('/orders', createAuthProvider(true), [parent]);
    expect(await screen.findByRole('link', { name: 'Orders' })).toHaveAttribute(
      'href',
      '/orders',
    );
    const toggle = screen.getByRole('button', { name: 'Orders' });
    fireEvent.click(toggle);
    expect(
      screen.queryByRole('link', { name: 'Reports' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Orders' })).toBeVisible();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('link', { name: 'Reports' }));
    expect(await screen.findByText('Reports page')).toBeVisible();
    expect(screen.getByText('Orders layout')).toBeVisible();
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

  it.each([true, false])(
    'checks the real API Keys settings contribution before loading it (%s)',
    async (allowed) => {
      const contributions = clientPlugins.plugins.map((plugin) => ({
        ...plugin,
        source: 'plugin' as const,
      }));
      const { settingsRouteTree: registeredSettingsRouteTree } =
        resolveAppClientContributions(contributions);
      const apiKeysRoute = registeredSettingsRouteTree.find(
        ({ packageName, path }) =>
          packageName === '@nocobase/app-plugin-api-keys' &&
          path === '/settings/api-keys',
      );
      if (!apiKeysRoute?.componentLoader) {
        throw new Error('Hub must register the API Keys settings page');
      }
      const loadApiKeys = vi.fn(apiKeysRoute.componentLoader);
      const settingsRouteTree = registeredSettingsRouteTree.map((route) =>
        route === apiKeysRoute
          ? { ...route, componentLoader: loadApiKeys }
          : route,
      );
      expect(settingsRouteTree).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            packageName: '@nocobase/app-plugin-api-keys',
            path: '/settings/api-keys',
            access: { resource: 'api-keys', action: 'access' },
          }),
        ]),
      );
      const i18n = await createAppI18nRuntime({
        locales: ['en-US'],
        contributions: contributions.flatMap(
          ({ packageName, source, locales }) =>
            locales ? [{ packageName, source, locales }] : [],
        ),
      });
      const authClient = createTestAuthClient(true);
      const can = vi.fn(async () => ({ can: allowed }));
      renderApplication('/settings/api-keys', createAuthProvider(true), [], {
        accessControlProvider: { can },
        settingsRouteTree,
        authClient,
        i18n,
      });
      if (allowed) {
        await waitFor(() => expect(loadApiKeys).toHaveBeenCalled(), {
          timeout: 10_000,
        });
        // Cold plugin transforms can outlast Testing Library's one-second DOM wait
        // on CI. Await the real route load under Vitest's test timeout, then render it.
        await act(async () => {
          await loadApiKeys.mock.results[0]?.value;
        });
        expect(
          await screen.findByRole('heading', { name: 'API keys' }),
        ).toBeVisible();
        expect(
          await screen.findByRole('link', { name: 'Settings' }),
        ).toBeVisible();
        await waitFor(() => expect(authClient.apiKey.list).toHaveBeenCalled());
      } else {
        expect(
          await screen.findByRole('heading', { name: 'No settings available' }),
        ).toBeVisible();
        expect(loadApiKeys).not.toHaveBeenCalled();
        expect(authClient.apiKey.list).not.toHaveBeenCalled();
        expect(
          screen.queryByRole('heading', { name: 'API keys' }),
        ).not.toBeInTheDocument();
      }
      expect(can).toHaveBeenCalledWith(
        expect.objectContaining({ resource: 'api-keys', action: 'access' }),
      );
    },
  );

  it('redirects the authorized Hub root through the Hub access rule', async () => {
    const can = vi.fn().mockResolvedValue({ can: true });
    const rootDefinition = applicationRoutes[0].routes[0];
    renderApplication(
      '/',
      createAuthProvider(true),
      [
        {
          ...rootDefinition,
          auth: rootDefinition.auth ?? 'required',
          id: '@nocobase/app-template-hub:applications-root',
          packageName: '@nocobase/app-template-hub',
          source: 'application',
        },
        {
          ...createRoute('apps', '/apps', 'required', ApplicationsPage),
          access: { resource: 'hub', action: 'access' },
        },
      ],
      { accessControlProvider: { can } },
    );

    expect(
      await screen.findByRole('heading', { name: 'Applications page' }),
    ).toBeVisible();
    expect(can).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'hub', action: 'access' }),
    );
    expect(can).not.toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'applications-root' }),
    );
  });

  it('shows a protected navigation entry as selected when access is allowed', async () => {
    renderApplication(
      '/users',
      createAuthProvider(true),
      [
        createRoute(
          'users',
          '/users',
          'required',
          UsersPage,
          'plugin',
          'User management',
          true,
        ),
      ],
      {
        accessControlProvider: {
          can: vi.fn().mockResolvedValue({ can: true }),
        },
      },
    );

    expect(
      await screen.findByRole('link', { name: 'User management' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByText('Users page')).toBeVisible();
  });

  it('never discloses a protected navigation entry when access is denied', async () => {
    const can = vi.fn().mockResolvedValue({ can: false });
    renderApplication(
      '/users',
      createAuthProvider(true),
      [
        createRoute(
          'users',
          '/users',
          'required',
          UsersPage,
          'plugin',
          'User management',
          true,
        ),
      ],
      {
        accessControlProvider: { can },
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
        createRoute(
          'roles',
          '/roles',
          'required',
          RolesPage,
          'plugin',
          'Roles & permissions',
        ),
        createRoute(
          'applications',
          '/apps',
          'required',
          ApplicationsPage,
          'plugin',
          'Applications',
        ),
        createRoute(
          'users',
          '/users',
          'required',
          UsersPage,
          'plugin',
          'User management',
        ),
      ],
      {
        accessControlProvider: {
          can: vi.fn().mockResolvedValue({ can: true }),
        },
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
    readonly authClient?: ReturnType<typeof createTestAuthClient>;
    readonly i18n?: I18nRuntime;
    readonly settingsRouteTree?: readonly AppClientRegisteredRoute[];
  } = {},
): void {
  const clientRoutes = routes.some(({ path }) => path === '/')
    ? [...routes]
    : [
        createRoute('home', '/', 'required', HomePage, 'application'),
        ...routes,
      ];
  const authenticated =
    (authProvider as TestAuthProvider).authenticated ?? true;
  const authClient = options.authClient ?? createTestAuthClient(authenticated);
  const app = {
    services: {
      resolve: (token: unknown) => {
        if (token === authenticationClientToken) return authClient;
        throw new Error(`Unexpected service token: ${String(token)}`);
      },
    },
  } as unknown as ClientApplication;
  const content = (
    <ClientApplicationContext.Provider value={app}>
      <AuthenticationProvider>
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
            >
              <AppRouter
                devRouteTree={[]}
                clientRoutes={clientRoutes}
                settingsRouteTree={options.settingsRouteTree ?? []}
              />
            </Refine>
          </AppThemeProvider>
        </MemoryRouter>
      </AuthenticationProvider>
    </ClientApplicationContext.Provider>
  );
  render(
    options.i18n ? (
      <I18nProvider runtime={options.i18n}>{content}</I18nProvider>
    ) : (
      content
    ),
  );
}

interface TestAuthProvider extends AuthProvider {
  readonly authenticated: boolean;
}

function createAuthProvider(authenticated: boolean): TestAuthProvider {
  return {
    authenticated,
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

function createTestAuthClient(authenticated: boolean) {
  return {
    apiKey: { list: vi.fn().mockResolvedValue({ data: { apiKeys: [] } }) },
    getSession: vi.fn().mockResolvedValue({
      data: authenticated
        ? {
            session: null,
            user: {
              email: 'alice@example.com',
              id: '1',
              image: null,
              name: 'Alice',
            },
          }
        : null,
    }),
    signOut: vi.fn().mockResolvedValue({ data: null }),
  };
}

function createRoute(
  name: string,
  path: string,
  auth: AppClientRegisteredRoute['auth'],
  Component: ComponentType,
  source: AppClientRegisteredRoute['source'] = 'plugin',
  navigationTitle?: string,
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
    ...(navigationTitle ? { navigation: { title: navigationTitle } } : {}),
    ...(protectedRoute ? { access: { resource: name, action: 'access' } } : {}),
  };
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
