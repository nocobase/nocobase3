import { render, screen, waitFor } from '@testing-library/react';
import { Refine } from '@refinedev/core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { configuredResources } from '@/app/extensions';
import { AppRoutes } from '@/app/routes';
import { hubAuthRuntime } from '@/features/hub/runtime';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Hub landing route', () => {
  it('sends an application-scoped viewer to its first readable application', async () => {
    vi.stubGlobal('__PORTAL_TEMPLATE_NAME__', 'NocoBase Hub');
    vi.stubGlobal('__PORTAL_TEMPLATE_VERSION__', 'test');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/auth/get-session')) {
        return Response.json({
          user: {
            id: 'viewer',
            name: 'Scoped viewer',
            email: 'viewer@example.com',
          },
          session: {
            id: 'session',
            expiresAt: '2026-09-01T00:00:00.000Z',
          },
        });
      }
      if (path.endsWith('/setup/status')) {
        return Response.json({
          data: { setupRequired: false, ownerConfigured: true },
          requestId: 'setup',
        });
      }
      if (path.endsWith('/me')) {
        return Response.json({
          data: {
            user: {
              id: 'viewer',
              name: 'Scoped viewer',
              email: 'viewer@example.com',
            },
            roles: [],
            capabilities: {
              global: [],
              application: [
                {
                  applicationId: 'app-1',
                  capabilities: [
                    { resource: 'hub.app', actions: ['read'] },
                    { resource: 'hub.release', actions: ['read'] },
                    { resource: 'hub.deployment', actions: ['read'] },
                  ],
                },
              ],
            },
          },
          requestId: 'me',
        });
      }
      if (path.endsWith('/apps/app-1')) {
        return Response.json({
          data: {
            id: 'app-1',
            slug: 'inventory',
            name: 'Inventory',
            description: null,
            status: 'active',
            defaultEnvironmentId: 'default',
            activeReleaseId: null,
            createdBy: 'owner',
            createdAt: '2026-08-20T10:00:00.000Z',
            updatedAt: '2026-08-21T10:00:00.000Z',
          },
          requestId: 'application',
        });
      }
      if (
        path.endsWith('/apps/app-1/releases') ||
        path.endsWith('/apps/app-1/deployments')
      ) {
        return Response.json({
          data: [],
          meta: { total: 0, limit: 20, offset: 0 },
          requestId: 'empty-list',
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <Refine
              authProvider={hubAuthRuntime.authProvider}
              resources={configuredResources}
            >
              <AppRoutes />
            </Refine>
          ),
        },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/apps/app-1'),
    );
    expect(
      fetchMock.mock.calls.some(([input]) => String(input) === '/hub/api/apps'),
    ).toBe(false);
  });

  it('renders an accessible landing for deployment-only application scope', async () => {
    vi.stubGlobal('__PORTAL_TEMPLATE_NAME__', 'NocoBase Hub');
    vi.stubGlobal('__PORTAL_TEMPLATE_VERSION__', 'test');
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/auth/get-session')) {
        return Response.json({
          user: {
            id: 'operator',
            name: 'Scoped operator',
            email: 'operator@example.com',
          },
          session: {
            id: 'session',
            expiresAt: '2026-09-01T00:00:00.000Z',
          },
        });
      }
      if (path.endsWith('/setup/status')) {
        return Response.json({
          data: { setupRequired: false, ownerConfigured: true },
          requestId: 'setup',
        });
      }
      if (path.endsWith('/me')) {
        return Response.json({
          data: {
            user: {
              id: 'operator',
              name: 'Scoped operator',
              email: 'operator@example.com',
            },
            roles: [],
            capabilities: {
              global: [],
              application: [
                {
                  applicationId: 'app-1',
                  capabilities: [
                    { resource: 'hub.deployment', actions: ['read'] },
                  ],
                },
              ],
            },
          },
          requestId: 'me',
        });
      }
      if (path.endsWith('/apps/app-1/deployments')) {
        return Response.json({
          data: [],
          meta: { total: 0, limit: 20, offset: 0 },
          requestId: 'deployments',
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const router = createMemoryRouter(
      [
        {
          path: '*',
          element: (
            <Refine
              authProvider={hubAuthRuntime.authProvider}
              resources={configuredResources}
            >
              <AppRoutes />
            </Refine>
          ),
        },
      ],
      { initialEntries: ['/'] },
    );

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'Deployments' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deployments' })).toHaveAttribute(
      'href',
      '/deployments',
    );
    expect(screen.queryByRole('button', { name: 'Applications' })).toBeNull();
    expect(router.state.location.pathname).toBe('/deployments');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/hub/api/apps/app-1/deployments'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        ([input]) => String(input) === '/hub/api/apps/app-1',
      ),
    ).toBe(false);
  });
});
