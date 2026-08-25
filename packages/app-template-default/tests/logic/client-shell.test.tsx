import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Refine, type AuthProvider } from '@refinedev/core';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect((await screen.findAllByText('Alice')).length).toBeGreaterThan(0);
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'App client is ready' }),
    ).toBeVisible();
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
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeVisible();
  });

  it('keeps authenticated standalone pages outside the application shell', async () => {
    renderApplication('/settings', createAuthProvider(true), [
      createRoute(
        'settings',
        '/settings',
        'required',
        StandaloneSettingsPage,
        'plugin',
        'standalone',
      ),
    ]);

    expect(await screen.findByText('Standalone settings page')).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Application navigation' }),
    ).not.toBeInTheDocument();
  });
});

function renderApplication(
  initialEntry: string,
  authProvider: AuthProvider,
  routes: readonly AppClientRegisteredRoute[] = [],
): void {
  const clientRoutes = [
    createRoute('home', '/', 'required', HomePage, 'application'),
    ...routes,
  ];
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppThemeProvider>
        <Refine
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
          <AppRouter clientRoutes={clientRoutes} />
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
  surface: AppClientRegisteredRoute['surface'] = 'application',
): AppClientRegisteredRoute {
  const packageName =
    source === 'application'
      ? '@nocobase/app-template-default'
      : '@nocobase/app-plugin-test';
  return {
    auth,
    componentLoader: async () => ({ default: Component }),
    id: `${packageName}:${name}`,
    name,
    packageName,
    path,
    source,
    surface,
  };
}

function HomePage(): ReactElement {
  return <h2>App client is ready</h2>;
}

function GuestPage(): ReactElement {
  return <div>Guest login page</div>;
}

function StandaloneSettingsPage(): ReactElement {
  return <div>Standalone settings page</div>;
}
