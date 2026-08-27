import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Refine } from '@refinedev/core';

import type {
  HubApplication,
  HubCapabilities,
  HubDeployment,
  HubDeploymentEvent,
  HubRelease,
} from '@/features/hub/api';
import { ApplicationsPage } from '@/pages/applications/list';
import { ApplicationDetailPage } from '@/pages/applications/detail';
import { DeploymentDetailPage } from '@/pages/deployments/detail';
import { DeploymentsPage } from '@/pages/deployments/list';
import { HubLoginPage, HubSetupPage } from '@/features/hub/auth-pages';
import { HubAuthGate } from '@/features/hub/gate';
import { HubRuntimeProvider } from '@/features/hub/provider';
import { createHubAuthRuntime } from '@/features/hub/runtime';
import { appRoutes } from '@/routes';
import { i18n, i18nProvider } from '@nocobase/app-portal-sdk/i18n';
import '@/locales';
import { portalI18nReady } from '@/providers/i18n/runtime';

const application: HubApplication = {
  id: 'app-1',
  slug: 'inventory',
  name: 'Inventory',
  description: 'Stock control',
  status: 'active',
  defaultEnvironmentId: 'default',
  activeRelease: {
    id: 'release-2',
    version: '1.2.0',
    createdAt: '2026-08-21T09:00:00.000Z',
  },
  createdBy: 'owner',
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
};

const release: HubRelease = {
  id: 'release-2',
  applicationId: 'app-1',
  version: '1.2.0',
  checksum: 'sha256:abc',
  manifest: { entry: 'index.html' },
  sizeBytes: 1024,
  verificationStatus: 'verified',
  createdBy: 'owner',
  createdAt: '2026-08-21T09:00:00.000Z',
};

const previousRelease: HubRelease = {
  ...release,
  id: 'release-1',
  version: '1.1.0',
  createdAt: '2026-08-20T09:00:00.000Z',
};

const deployment: HubDeployment = {
  id: 'deployment-1',
  applicationId: 'app-1',
  environmentId: 'default',
  targetReleaseId: 'release-2',
  previousReleaseId: 'release-1',
  type: 'deploy',
  status: 'succeeded',
  requestedBy: 'owner',
  hostOperationId: 'host-op-1',
  startedAt: '2026-08-21T09:01:00.000Z',
  finishedAt: '2026-08-21T09:02:00.000Z',
  failure: null,
  createdAt: '2026-08-21T09:00:30.000Z',
};

const event: HubDeploymentEvent = {
  id: 'event-1',
  deploymentId: 'deployment-1',
  sequence: 1,
  type: 'readiness',
  status: 'succeeded',
  message: 'Readiness checks passed',
  hostId: 'host-1',
  runtimeId: 'runtime-1',
  details: {},
  createdAt: '2026-08-21T09:01:30.000Z',
};

const readOnly: HubCapabilities = {
  global: [
    { resource: 'hub.app', actions: ['read'] },
    { resource: 'hub.release', actions: ['read'] },
    { resource: 'hub.deployment', actions: ['read'] },
  ],
  application: [],
};

function response<T>(data: T, meta = { total: 1, limit: 20, offset: 0 }) {
  return new Response(
    JSON.stringify({ data, meta, requestId: 'test-request' }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('Hub application pages', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('offers card and list views with a direct application link', async () => {
    const summaryApplication = {
      ...application,
      isDefault: true,
      revision: 2,
      latestRelease: {
        id: 'release-2',
        version: '1.2.0',
        createdAt: release.createdAt,
      },
      runtime: {
        state: 'running',
        health: 'healthy',
        releaseId: 'release-2',
        lastCheckedAt: '2026-08-21T09:02:00.000Z',
      },
      links: {
        self: '/hub/api/apps/app-1',
        open: 'https://apps.example.com/inventory/',
      },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps')) return response([summaryApplication]);
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: ['Viewer'],
          capabilities: readOnly,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', { name: 'Open Inventory' }),
    ).toHaveAttribute('href', 'https://apps.example.com/inventory/');
    expect(screen.getAllByText('1.2.0').length).toBeGreaterThan(0);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getAllByText('Active')).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: /develop inventory/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /list view/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /card view/i }),
    ).toBeInTheDocument();
  });

  it('offers capability-safe runtime and redeploy actions in card and list views', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read', 'create'] },
        {
          resource: 'hub.deployment',
          actions: ['read', 'redeploy'],
        },
        { resource: 'hub.runtime', actions: ['read', 'control'] },
      ],
      application: [],
    };
    const runningApplication: HubApplication = {
      ...application,
      runtime: {
        state: 'running',
        health: 'healthy',
        releaseId: 'release-2',
        lastCheckedAt: application.updatedAt,
      },
      links: {
        self: '/hub/api/apps/app-1',
        open: 'https://apps.example.com/inventory/',
      },
    };
    const stoppedApplication: HubApplication = {
      ...runningApplication,
      id: 'app-2',
      slug: 'orders',
      name: 'Orders',
      runtime: {
        state: 'stopped',
        health: 'unknown',
        releaseId: 'release-2',
        lastCheckedAt: application.updatedAt,
      },
      links: {
        self: '/hub/api/apps/app-2',
        open: null,
      },
    };
    const idleApplication: HubApplication = {
      ...runningApplication,
      id: 'app-3',
      slug: 'billing',
      name: 'Billing',
      runtime: {
        state: 'idle',
        health: 'unknown',
        releaseId: 'release-2',
        lastCheckedAt: application.updatedAt,
      },
      links: {
        self: '/hub/api/apps/app-3',
        open: 'https://apps.example.com/billing/',
      },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Deployer'], capabilities });
      }
      if (path.endsWith('/apps')) {
        return response(
          [runningApplication, stoppedApplication, idleApplication],
          {
            total: 3,
            limit: 20,
            offset: 0,
          },
        );
      }
      if (path.endsWith('/apps/app-1/runtime/restart')) {
        expect(init?.method).toBe('POST');
        return response({
          applicationId: 'app-1',
          environmentId: 'default',
          runtimeId: 'inventory:2',
          state: 'running',
          health: 'healthy',
          releaseId: 'release-2',
          startedAt: application.updatedAt,
          lastSeenAt: application.updatedAt,
        });
      }
      if (path.endsWith('/apps/app-2/runtime/start')) {
        expect(init?.method).toBe('POST');
        return response({
          applicationId: 'app-2',
          environmentId: 'default',
          runtimeId: 'orders:1',
          state: 'running',
          health: 'healthy',
          releaseId: 'release-2',
          startedAt: application.updatedAt,
          lastSeenAt: application.updatedAt,
        });
      }
      if (path.endsWith('/apps/app-1/deployments') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          targetReleaseId: 'release-2',
          type: 'redeploy',
        });
        expect(new Headers(init.headers).get('idempotency-key')).toMatch(
          /^[0-9a-f-]{36}$/i,
        );
        return response({ ...deployment, id: 'redeployment-quick' });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <HubRuntimeProvider fetcher={fetchMock}>
          <ApplicationsPage fetcher={fetchMock} />
        </HubRuntimeProvider>
      </MemoryRouter>,
    );

    const manageAction = await screen.findByRole('button', {
      name: 'Manage Inventory',
    });
    expect(manageAction).toHaveClass('border-border');
    expect(manageAction.querySelector('svg')).not.toBeNull();

    const developAction = screen.getByRole('button', {
      name: 'Develop Inventory',
    });
    expect(developAction).toHaveClass('border-border');
    expect(developAction.querySelector('svg')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Restart Inventory' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Stop Inventory' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start Inventory' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Start Orders' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Restart Orders' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Orders' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open Billing' }),
    ).toHaveAttribute('href', 'https://apps.example.com/billing/');
    expect(
      screen.getByRole('button', { name: 'Stop Billing' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Restart Billing' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Restart Inventory' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Restart application' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restart' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/runtime/restart',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Start Orders' }),
    );
    expect(
      screen.getByRole('alertdialog', { name: 'Start application' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm start' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-2/runtime/start',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'List view' }));
    const redeploy = await screen.findByRole('button', {
      name: 'Redeploy Inventory',
    });
    fireEvent.click(redeploy);
    expect(
      screen.getByRole('alertdialog', { name: 'Redeploy current release' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm redeployment' }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/deployments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            targetReleaseId: 'release-2',
            type: 'redeploy',
          }),
        }),
      ),
    );
  });

  it('only offers application statuses supported by the list API', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps')) return response([application]);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: [], capabilities: readOnly });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    const statusFilter = await screen.findByRole('combobox', {
      name: 'Filter by status',
    });
    expect(statusFilter).not.toContainElement(
      screen.queryByRole('option', { name: 'Disabled' }),
    );
    expect(
      screen.getByRole('option', { name: 'Archived' }),
    ).toBeInTheDocument();
  });

  it('guides an authorized user to create the first application without CLI publish instructions', async () => {
    const capabilities: HubCapabilities = {
      global: [{ resource: 'hub.app', actions: ['create', 'read'] }],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps')) {
        return response<HubApplication[]>([], {
          total: 0,
          limit: 20,
          offset: 0,
        });
      }
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Owner'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/create an application.*coding agent/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('nb app publish')).not.toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: /create application/i }),
    ).toHaveLength(2);
  });

  it('does not present the latest undeployed release as the current release', async () => {
    const summaryApplication = {
      ...application,
      latestRelease: {
        id: 'release-3',
        version: '1.3.0',
        createdAt: '2026-08-22T09:00:00.000Z',
      },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps')) return response([summaryApplication]);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: [], capabilities: readOnly });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('1.2.0')).toBeInTheDocument();
    expect(screen.getByText('1.3.0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /list view/i }));
    expect(screen.getByText('1.2.0')).toBeInTheDocument();
    expect(screen.queryByText('1.3.0')).not.toBeInTheDocument();
  });

  it('confirms an initial deployment, shows progress, and opens its deployment', async () => {
    const initialRelease = {
      id: 'release-initial',
      version: '0.0.1',
      createdAt: '2026-08-22T09:00:00.000Z',
    };
    const undeployedApplication: HubApplication = {
      ...application,
      activeRelease: null,
      latestRelease: initialRelease,
      links: { self: '/hub/api/apps/app-1', open: null },
      runtime: {
        state: 'stopped',
        health: 'unknown',
        releaseId: null,
        lastCheckedAt: null,
      },
    };
    const deployCapabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read'] },
        { resource: 'hub.deployment', actions: ['read', 'deploy'] },
      ],
      application: [],
    };
    let resolveDeployment: ((value: Response) => void) | undefined;
    const deploymentResponse = new Promise<Response>((resolve) => {
      resolveDeployment = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: ['Deployer'],
          capabilities: deployCapabilities,
        });
      }
      if (path.endsWith('/apps/app-1/deployments')) {
        expect(init).toMatchObject({ method: 'POST' });
        return deploymentResponse;
      }
      if (path.endsWith('/apps')) {
        return response([undeployedApplication]);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path='/' element={<ApplicationsPage fetcher={fetchMock} />} />
          <Route
            path='/deployments/:deploymentId'
            element={<p>Deployment accepted</p>}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /deploy 0\.0\.1/i }),
    );

    expect(
      screen.getByRole('alertdialog', { name: 'Deploy release' }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/apps/app-1/deployments') &&
          init?.method === 'POST',
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm deployment' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/deployments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            targetReleaseId: initialRelease.id,
            type: 'deploy',
          }),
        }),
      ),
    );
    expect(screen.getByRole('button', { name: /deploying/i })).toBeDisabled();

    resolveDeployment?.(
      response({
        ...deployment,
        id: 'initial-deployment',
        targetReleaseId: initialRelease.id,
      }),
    );

    expect(await screen.findByText('Deployment accepted')).toBeInTheDocument();
  });

  it('declares the governance routes shown by the application platform', () => {
    expect(appRoutes.map((route) => route.name)).toEqual(
      expect.arrayContaining(['audit', 'members', 'settings']),
    );
  });

  it('creates an application through the Hub API and refreshes the list', async () => {
    const capabilities: HubCapabilities = {
      global: [{ resource: 'hub.app', actions: ['create', 'read'] }],
      application: [],
    };
    let applications: HubApplication[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Owner'], capabilities });
      }
      if (path.endsWith('/apps') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          slug: string;
          name: string;
          description?: string;
        };
        applications = [
          {
            ...application,
            id: 'app-created',
            slug: body.slug,
            name: body.name,
            description: body.description ?? null,
            activeRelease: null,
          },
        ];
        return new Response(
          JSON.stringify({ data: applications[0], requestId: 'created' }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      if (path.endsWith('/apps')) {
        return response(applications, {
          total: applications.length,
          limit: 20,
          offset: 0,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(
      (
        await screen.findAllByRole('button', {
          name: /create application/i,
        })
      )[0],
    );
    expect(
      screen.getByText(
        'A stable identifier used by releases and deployments. It cannot be changed after creation.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Register the stable identity used by releases and deployments.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Default application template'),
    ).not.toBeInTheDocument();
    const slugInput = screen.getByLabelText('Slug');
    const slugPattern = slugInput.getAttribute('pattern');
    expect(slugPattern).toContain('\\-');
    expect(() => new RegExp(slugPattern ?? '', 'v')).not.toThrow();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Orders' },
    });
    fireEvent.change(screen.getByLabelText('Slug'), {
      target: { value: 'orders' },
    });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Order operations' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));

    expect(await screen.findByText('Orders')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/apps',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Orders',
          slug: 'orders',
          description: 'Order operations',
        }),
      }),
    );
    const createRequest = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/apps') && init?.method === 'POST',
    );
    expect(
      new Headers(createRequest?.[1]?.headers).get('idempotency-key'),
    ).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('loads the next page when the application result has more records', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...application,
      id: `app-${index + 1}`,
      name: `Application ${index + 1}`,
    }));
    const secondPage = [
      { ...application, id: 'app-21', name: 'Application 21' },
    ];
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: [], capabilities: readOnly });
      }
      if (path.endsWith('/apps?limit=20&offset=20')) {
        return response(secondPage, { total: 21, limit: 20, offset: 20 });
      }
      if (path.endsWith('/apps')) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /load more/i }));
    expect(await screen.findByText('Application 21')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/apps?limit=20&offset=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('renders a useful empty state and hides create actions without capability', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps'))
        return response<HubApplication[]>([], {
          total: 0,
          limit: 20,
          offset: 0,
        });
      if (path.endsWith('/me'))
        return response({ user: null, roles: [], capabilities: readOnly });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationsPage fetcher={fetchMock} onCreateApplication={vi.fn()} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('No applications yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /create application/i }),
    ).not.toBeInTheDocument();
  });

  it('shows a release and deployment tabs while hiding deploy for a viewer', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) return response([release]);
      if (path.endsWith('/apps/app-1/deployments'))
        return response([deployment]);
      if (path.endsWith('/me'))
        return response({
          user: null,
          roles: ['Viewer'],
          capabilities: readOnly,
        });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage
          applicationId='app-1'
          fetcher={fetchMock}
          onDeployRelease={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Inventory' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Releases' }));
    expect(await screen.findByText('1.2.0')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /deploy/i }),
    ).not.toBeInTheDocument();
  });

  it('guides release publishing through a Coding Agent instead of the CLI', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) return response([]);
      if (path.endsWith('/apps/app-1/deployments')) return response([]);
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: ['Viewer'],
          capabilities: readOnly,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Releases' }));
    expect(
      await screen.findByText(/coding agent.*publish/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/CLI/i)).not.toBeInTheDocument();
  });

  it('shows release details and pins the release through the approved API', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read', 'update'] },
      ],
      application: [],
    };
    let pinned = false;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases/release-2/pin')) {
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe('{}');
        pinned = true;
        return response({
          ...release,
          retention: {
            pinned: true,
            pinnedBy: 'owner',
            pinnedAt: '2026-08-25T10:00:00.000Z',
          },
        });
      }
      if (path.endsWith('/apps/app-1/releases/release-2')) {
        return response({
          ...release,
          retention: {
            pinned,
            pinnedBy: pinned ? 'owner' : null,
            pinnedAt: pinned ? '2026-08-25T10:00:00.000Z' : null,
          },
        });
      }
      if (path.endsWith('/apps/app-1/releases')) return response([release]);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Admin'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Releases' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'View release 1.2.0' }),
    );
    expect(await screen.findByText('sha256:abc')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pin release' }));

    expect(
      await screen.findByRole('button', { name: 'Unpin release' }),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/apps/app-1/releases/release-2/pin',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    );
  });

  it('restores an archived application with revision protection', async () => {
    const archivedApplication = {
      ...application,
      status: 'archived',
      revision: 4,
    };
    const capabilities: HubCapabilities = {
      global: [{ resource: 'hub.app', actions: ['read', 'restore'] }],
      application: [],
    };
    let resolveRestore: ((value: Response) => void) | undefined;
    const restoreResponse = new Promise<Response>((resolve) => {
      resolveRestore = resolve;
    });
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1/restore')) {
        expect(init?.method).toBe('POST');
        expect(new Headers(init?.headers).get('if-match')).toBe('"rev-4"');
        expect(init?.body).toBe('{}');
        return restoreResponse;
      }
      if (path.endsWith('/apps/app-1')) return response(archivedApplication);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Admin'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Settings' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore application' }),
    );

    expect(
      screen.getByRole('alertdialog', { name: 'Restore application' }),
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/apps/app-1/restore') &&
          init?.method === 'POST',
      ),
    ).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/restore',
        expect.objectContaining({ method: 'POST', body: '{}' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeDisabled();

    resolveRestore?.(
      response({
        ...archivedApplication,
        status: 'active',
        revision: 5,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
  });

  it('redeploys the current release from the release table', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read'] },
        { resource: 'hub.deployment', actions: ['read', 'redeploy'] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) return response([release]);
      if (path.endsWith('/apps/app-1/deployments') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          targetReleaseId: 'release-2',
          type: 'redeploy',
        });
        return response({ ...deployment, id: 'redeployment-1' });
      }
      if (path.endsWith('/apps/app-1/deployments')) return response([]);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Deployer'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Releases' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Redeploy 1.2.0' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm redeployment' }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/deployments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            targetReleaseId: 'release-2',
            type: 'redeploy',
          }),
        }),
      ),
    );
  });

  it.each([
    {
      state: 'stopped',
      open: null,
      visibleAction: 'Start',
      hiddenActions: ['Restart', 'Stop application'],
    },
    {
      state: 'idle',
      open: '/inventory/',
      visibleAction: 'Stop application',
      hiddenActions: ['Start', 'Restart'],
    },
  ])(
    'projects $state runtime controls and application access consistently',
    async ({ state, open, visibleAction, hiddenActions }) => {
      const capabilities: HubCapabilities = {
        global: [
          { resource: 'hub.app', actions: ['read'] },
          { resource: 'hub.runtime', actions: ['read', 'control'] },
        ],
        application: [],
      };
      const fetchMock = vi.fn<typeof fetch>(async (input) => {
        const path = String(input);
        if (path.endsWith('/apps/app-1')) {
          return response({
            ...application,
            links: { self: '/hub/api/apps/app-1', open },
          });
        }
        if (path.endsWith('/apps/app-1/runtime')) {
          return response({
            applicationId: 'app-1',
            environmentId: 'default',
            runtimeId: null,
            state,
            health: 'unknown',
            releaseId: 'release-2',
            releaseVersion: '1.2.0',
            url: open,
            startedAt: null,
            lastSeenAt: null,
            lastCheckedAt: null,
            activeRequests: 0,
            failure: null,
          });
        }
        if (path.endsWith('/me')) {
          return response({ user: null, roles: ['Deployer'], capabilities });
        }
        throw new Error(`Unexpected request: ${path}`);
      });

      render(
        <MemoryRouter initialEntries={['/apps/app-1?tab=settings']}>
          <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
        </MemoryRouter>,
      );

      await screen.findByRole('tab', { name: 'Settings' });
      fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
      expect(await screen.findByText('Runtime and health')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: visibleAction }),
      ).toBeInTheDocument();
      for (const action of hiddenActions) {
        expect(screen.queryByRole('button', { name: action })).toBeNull();
      }
      if (open) {
        expect(
          screen.getByRole('button', { name: 'Open application' }),
        ).toHaveAttribute('href', open);
      } else {
        expect(
          screen.queryByRole('button', { name: 'Open application' }),
        ).toBeNull();
      }
    },
  );

  it('shows development, permissions, and settings sections when authorized', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read', 'update', 'archive'] },
        { resource: 'hub.release', actions: ['read', 'create'] },
        { resource: 'hub.deployment', actions: ['read'] },
        { resource: 'hub.runtime', actions: ['read', 'control'] },
        { resource: 'hub.runtimeSecret', actions: ['read', 'rotate'] },
        { resource: 'hub.permission', actions: ['read', 'assign'] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) {
        return response({
          ...application,
          revision: 4,
          links: { self: '/hub/api/apps/app-1', open: '/inventory/' },
        });
      }
      if (path.endsWith('/apps/app-1/releases')) return response([release]);
      if (path.endsWith('/apps/app-1/deployments'))
        return response([deployment]);
      if (path.endsWith('/apps/app-1/runtime')) {
        return response({
          applicationId: 'app-1',
          environmentId: 'default',
          runtimeId: 'inventory:1',
          state: 'running',
          health: 'healthy',
          releaseId: 'release-2',
          releaseVersion: '1.2.0',
          url: '/inventory/',
          startedAt: application.updatedAt,
          lastSeenAt: application.updatedAt,
          lastCheckedAt: application.updatedAt,
          activeRequests: 0,
          failure: null,
        });
      }
      if (path.endsWith('/apps/app-1/runtime-secret')) {
        return response({ configured: true, version: 1, rotatedAt: null });
      }
      if (path.endsWith('/apps/app-1/access')) {
        return response([
          {
            memberId: 'member-1',
            name: 'Alice',
            email: 'alice@example.com',
            username: 'alice',
            status: 'active',
            roles: ['viewer'],
          },
        ]);
      }
      if (path.endsWith('/apps/app-1/access?limit=1&offset=0')) {
        const result = response([]);
        result.headers.set('etag', '"rev-3"');
        return result;
      }
      if (path.endsWith('/apps/app-1/access/member-1')) {
        expect(init?.method).toBe('PUT');
        expect(new Headers(init?.headers).get('if-match')).toBe('"rev-3"');
        expect(JSON.parse(String(init?.body))).toEqual({
          roles: ['developer', 'viewer'],
        });
        return response({ revision: 4, roles: ['developer', 'viewer'] });
      }
      if (path.endsWith('/roles')) {
        return response([
          {
            id: 'developer',
            key: 'developer',
            scope: 'global',
            scopes: ['global', 'application'],
            capabilities: [],
          },
          {
            id: 'viewer',
            key: 'viewer',
            scope: 'global',
            scopes: ['global', 'application'],
            capabilities: [],
          },
        ]);
      }
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Admin'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Inventory' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Development' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Permissions' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Settings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Permissions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit roles' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /developer/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save roles' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/access/member-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ roles: ['developer', 'viewer'] }),
        }),
      ),
    );
  });

  it('shows a quick setup document for local development and deployment', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read', 'create'] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) return response([]);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Developer'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={['/?tab=development']}>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Quick setup' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Development' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'No local APP source' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Existing local APP source' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Deploy to this Hub' }),
    ).toBeInTheDocument();

    const commandBlocks = await screen.findAllByText(
      (_, element) => element?.tagName === 'PRE',
    );
    const commandText = commandBlocks.map(
      (command) => command.textContent ?? '',
    );
    const hubUrl = new URL('/hub', window.location.origin).toString();
    expect(commandText).toContain(
      'pnpm config set @nocobase:registry https://npm.nocobase.ai/\npnpm create @nocobase/app inventory\ncd inventory\npnpm dev',
    );
    expect(commandText).toContain(
      'cd <existing-app-directory>\npnpm install\npnpm dev',
    );
    expect(commandText).toContain(
      `pnpm run deploy --hub ${hubUrl} --app inventory`,
    );
    expect(commandText).toHaveLength(3);
    expect(commandText.join('\n')).not.toContain('pnpm check');
    expect(commandText.join('\n')).not.toContain('--non-interactive');
    expect(commandText.join('\n')).not.toContain('pnpm run pull');
    expect(commandText.join('\n')).not.toContain('pnpm run push');
    expect(commandText.join('\n')).not.toContain('nb3 ');
    expect(
      screen.getByRole('button', { name: 'Copy create APP commands' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Copy deployment command' }),
    ).toBeInTheDocument();
    expect(screen.getByText('pnpm run deploy')).toBeInTheDocument();
    expect(screen.queryByText('Related commands')).toBeNull();
    expect(screen.queryByText('Develop with a Coding Agent')).toBeNull();
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/apps/app-1/repository'),
      ),
    ).toBe(false);
  });

  it('guides an empty default APP through its first local build and deployment', async () => {
    const emptyDefaultApplication: HubApplication = {
      ...application,
      id: 'system-default-application',
      slug: 'default',
      name: 'Default application',
      description: null,
      isDefault: true,
      activeRelease: null,
      latestRelease: null,
      runtime: {
        state: 'stopped',
        health: 'unknown',
        releaseId: null,
        lastCheckedAt: null,
      },
      links: {
        self: '/hub/api/apps/system-default-application',
        open: null,
      },
    };
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read', 'create'] },
        { resource: 'hub.deployment', actions: ['read', 'deploy'] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps/system-default-application')) {
        return response(emptyDefaultApplication);
      }
      if (path.endsWith('/apps/system-default-application/releases')) {
        return response([], { total: 0, limit: 20, offset: 0 });
      }
      if (path.endsWith('/apps/system-default-application/deployments')) {
        return response([], { total: 0, limit: 20, offset: 0 });
      }
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Developer'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage
          applicationId='system-default-application'
          fetcher={fetchMock}
        />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Default application' });
    expect(
      screen.queryByRole('heading', {
        name: 'Build and deploy this application',
      }),
    ).toBeNull();
    expect(screen.queryByText('Use an existing local application')).toBeNull();
    expect(screen.queryByText('Create a new local application')).toBeNull();
    expect(screen.getAllByText('Not deployed').length).toBeGreaterThan(0);
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.getByText('No deployments')).toBeInTheDocument();
    expect(await screen.findByText('0')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open development instructions' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Open application' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /^Deploy$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Start$/ })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Releases' }));
    expect(
      await screen.findByText(
        'Use existing local source or create a new application from the default template, then publish its first Release.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open development instructions' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Open development instructions' }),
    );
    const developmentCommands = await screen.findAllByText(
      (_, element) => element?.tagName === 'PRE',
    );
    const developmentCommandText = developmentCommands.map(
      (command) => command.textContent ?? '',
    );
    expect(developmentCommandText).toContain(
      'pnpm config set @nocobase:registry https://npm.nocobase.ai/\npnpm create @nocobase/app default\ncd default\npnpm dev',
    );
    expect(developmentCommandText).toContain(
      `pnpm run deploy --hub ${new URL('/hub', window.location.origin).toString()} --app default`,
    );
  });

  it('does not request or misreport resources outside an app-only scope', async () => {
    const appOnly: HubCapabilities = {
      global: [],
      application: [
        {
          applicationId: 'app-1',
          capabilities: [{ resource: 'hub.app', actions: ['read'] }],
        },
      ],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: [], capabilities: appOnly });
      }
      if (path.endsWith('/apps/app-1')) return response(application);
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <HubRuntimeProvider fetcher={fetchMock}>
          <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
        </HubRuntimeProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Inventory' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Releases' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Deployments' })).toBeNull();
    expect(screen.getAllByText('Restricted')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/apps/app-1/releases'),
      ),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/apps/app-1/deployments'),
      ),
    ).toBe(false);
  });

  it('does not offer development instructions without release creation access', async () => {
    const capabilities: HubCapabilities = {
      global: readOnly.global,
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Viewer'], capabilities });
      }
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) return response([release]);
      if (path.endsWith('/apps/app-1/deployments')) {
        return response([deployment]);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Inventory' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Development' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Develop' })).toBeNull();
  });

  it('loads additional releases from application pagination metadata', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...release,
      id: `release-${index + 1}`,
      version: `1.${index + 1}.0`,
    }));
    const nextRelease = {
      ...release,
      id: 'release-21',
      version: '1.21.0',
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases?limit=20&offset=20')) {
        return response([nextRelease], { total: 21, limit: 20, offset: 20 });
      }
      if (path.endsWith('/apps/app-1/releases')) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      if (path.endsWith('/apps/app-1/deployments')) return response([]);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: [], capabilities: readOnly });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Releases' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('1.21.0')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/apps/app-1/releases?limit=20&offset=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('loads additional application deployments from pagination metadata', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...deployment,
      id: `deployment-${index + 1}`,
    }));
    const nextDeployment = { ...deployment, id: 'deployment-21' };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) return response([release]);
      if (path.endsWith('/apps/app-1/deployments?limit=20&offset=20')) {
        return response([nextDeployment], {
          total: 21,
          limit: 20,
          offset: 20,
        });
      }
      if (path.endsWith('/apps/app-1/deployments')) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      if (path.endsWith('/me')) {
        return response({ user: null, roles: [], capabilities: readOnly });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Deployments' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByText('deployment-21')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/apps/app-1/deployments?limit=20&offset=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates a deployment for a verified release and navigates to it', async () => {
    const candidate = {
      ...release,
      id: 'release-3',
      version: '1.3.0',
    };
    const writable: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read'] },
        { resource: 'hub.deployment', actions: ['deploy', 'read'] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases'))
        return response([release, candidate]);
      if (path.endsWith('/apps/app-1/deployments') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: {
              ...deployment,
              id: 'deployment-created',
              targetReleaseId: candidate.id,
              type: 'deploy',
              status: 'queued',
            },
            requestId: 'deployment-request',
          }),
          { status: 202, headers: { 'content-type': 'application/json' } },
        );
      }
      if (path.endsWith('/apps/app-1/deployments')) return response([]);
      if (path.endsWith('/me'))
        return response({
          user: null,
          roles: ['Deployer'],
          capabilities: writable,
        });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={['/apps/app-1']}>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Releases' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Deploy 1.3.0' }),
    );
    expect(
      await screen.findByText(/current release.*1\.2\.0/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /confirm deployment/i }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/deployments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            targetReleaseId: 'release-3',
            type: 'deploy',
          }),
        }),
      ),
    );
  });
});

describe('Hub setup page', () => {
  it('moves to sign in when owner creation succeeds but automatic login fails', async () => {
    let ownerCreated = false;
    let setupChecksAfterOwnerCreation = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/setup/status')) {
        if (ownerCreated) setupChecksAfterOwnerCreation += 1;
        return response({
          setupRequired: !ownerCreated,
          ownerConfigured: ownerCreated,
        });
      }
      if (path.endsWith('/setup/owner') && init?.method === 'POST') {
        ownerCreated = true;
        return new Response(
          JSON.stringify({
            data: { user: { id: 'owner' } },
            requestId: 'owner',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      if (path.endsWith('/auth/get-session')) {
        return Response.json(null);
      }
      if (path.endsWith('/auth/sign-in/email')) {
        return Response.json(
          { error: { code: 'SIGN_IN_FAILED', message: 'Sign in failed' } },
          { status: 401 },
        );
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const runtime = createHubAuthRuntime({
      baseURL: '/hub/api',
      fetcher: fetchMock,
    });

    render(
      <MemoryRouter initialEntries={['/setup']}>
        <Refine authProvider={runtime.authProvider}>
          <HubAuthGate runtime={runtime} fetcher={fetchMock}>
            <Routes>
              <Route
                path='/setup'
                element={<HubSetupPage fetcher={fetchMock} />}
              />
              <Route
                path='/login'
                element={<HubLoginPage fetcher={fetchMock} />}
              />
            </Routes>
          </HubAuthGate>
        </Refine>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Owner' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Owner' }));

    expect(
      await screen.findByText('Owner created. Sign in to continue.'),
    ).toBeInTheDocument();
    expect(setupChecksAfterOwnerCreation).toBeGreaterThan(0);
  });
});

describe('Hub deployment list', () => {
  it('resolves release versions and operator names for the prototype columns', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read'] },
        { resource: 'hub.deployment', actions: ['read'] },
        { resource: 'hub.member', actions: ['read'] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({
          user: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
          roles: ['Admin'],
          capabilities,
        });
      }
      if (path.endsWith('/deployments')) return response([deployment]);
      if (path.endsWith('/apps')) return response([application]);
      if (path.endsWith('/apps/app-1/releases/release-1')) {
        return response(previousRelease);
      }
      if (path.endsWith('/apps/app-1/releases/release-2')) {
        return response(release);
      }
      if (path.endsWith('/members/owner')) {
        return response({
          id: 'owner',
          name: 'Alice Owner',
          email: 'owner@example.com',
          username: 'owner',
          status: 'active',
          createdAt: application.createdAt,
          revision: 1,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <HubRuntimeProvider fetcher={fetchMock}>
          <DeploymentsPage fetcher={fetchMock} />
        </HubRuntimeProvider>
      </MemoryRouter>,
    );

    expect(await screen.findAllByText('1.1.0')).not.toHaveLength(0);
    expect(await screen.findAllByText('1.2.0')).not.toHaveLength(0);
    expect(await screen.findAllByText('Alice Owner')).not.toHaveLength(0);
    expect(screen.getAllByText('Deploy')).not.toHaveLength(0);
    expect(screen.getAllByText('1m')).not.toHaveLength(0);
    expect(
      screen.getByRole('columnheader', { name: 'From release' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'To release' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Duration' }),
    ).toBeInTheDocument();
  });

  it('moves between deployment pages from pagination metadata', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...deployment,
      id: `deployment-${index + 1}`,
    }));
    const nextDeployment = { ...deployment, id: 'deployment-21' };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/deployments?limit=20&offset=20')) {
        return response([nextDeployment], {
          total: 21,
          limit: 20,
          offset: 20,
        });
      }
      if (path.endsWith('/deployments')) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      if (path.endsWith('/apps')) return response([application]);
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));

    expect(await screen.findAllByText('deployment-21')).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/deployments?limit=20&offset=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('loads every application page before resolving deployment names', async () => {
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      ...application,
      id: `app-${index + 1}`,
      name: `Application ${index + 1}`,
    }));
    const lastApplication = {
      ...application,
      id: 'app-21',
      name: 'Application 21',
    };
    const deploymentForLastApplication = {
      ...deployment,
      id: 'deployment-21',
      applicationId: 'app-21',
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/deployments')) {
        return response([deploymentForLastApplication]);
      }
      if (path.endsWith('/apps?limit=20&offset=20')) {
        return response([lastApplication], {
          total: 21,
          limit: 20,
          offset: 20,
        });
      }
      if (path.endsWith('/apps')) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentsPage fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(await screen.findAllByText('Application 21')).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/apps?limit=20&offset=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});

describe('Deployment detail page', () => {
  it('shows type, release transition, operator, and duration using existing lookups', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read'] },
        { resource: 'hub.deployment', actions: ['read'] },
        { resource: 'hub.member', actions: ['read'] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/deployments/deployment-1')) {
        return response(deployment);
      }
      if (path.endsWith('/deployments/deployment-1/events')) {
        return response([event]);
      }
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases/release-1')) {
        return response(previousRelease);
      }
      if (path.endsWith('/apps/app-1/releases/release-2')) {
        return response(release);
      }
      if (path.endsWith('/members/owner')) {
        return response({
          id: 'owner',
          name: 'Alice Owner',
          email: 'owner@example.com',
          username: 'owner',
          status: 'active',
          createdAt: application.createdAt,
          revision: 1,
        });
      }
      if (path.endsWith('/me')) {
        return response({
          user: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
          roles: ['Admin'],
          capabilities,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentDetailPage deploymentId='deployment-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('1.1.0')).toBeInTheDocument();
    expect(screen.getAllByText('1.2.0')).toHaveLength(2);
    expect(screen.getByText('Deploy')).toBeInTheDocument();
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it('redeploys the same target release through the Hub API', async () => {
    const writable: HubCapabilities = {
      global: [{ resource: 'hub.deployment', actions: ['redeploy', 'read'] }],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/deployments/deployment-1'))
        return response(deployment);
      if (path.endsWith('/deployments/deployment-1/events'))
        return response([event]);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/deployments') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: {
              ...deployment,
              id: 'deployment-recreated',
              type: 'redeploy',
              status: 'queued',
            },
            requestId: 'redeploy-request',
          }),
          { status: 202, headers: { 'content-type': 'application/json' } },
        );
      }
      if (path.endsWith('/me'))
        return response({
          user: null,
          roles: ['Deployer'],
          capabilities: writable,
        });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentDetailPage deploymentId='deployment-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Redeploy' }));
    fireEvent.click(screen.getByRole('button', { name: /confirm redeploy/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/deployments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            targetReleaseId: 'release-2',
            type: 'redeploy',
          }),
        }),
      ),
    );
  });

  it('hides redeploy after the application active release has changed', async () => {
    const writable: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.deployment', actions: ['redeploy', 'read'] },
      ],
      application: [],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/deployments/deployment-1'))
        return response(deployment);
      if (path.endsWith('/deployments/deployment-1/events'))
        return response([event]);
      if (path.endsWith('/apps/app-1')) {
        return response({
          ...application,
          activeRelease: {
            id: 'release-3',
            version: '1.3.0',
            createdAt: '2026-08-22T09:00:00.000Z',
          },
        });
      }
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: ['Deployer'],
          capabilities: writable,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentDetailPage deploymentId='deployment-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('1.3.0')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Redeploy' }),
    ).not.toBeInTheDocument();
  });

  it('returns a deployment-only scoped viewer to the accessible home', async () => {
    const deploymentOnly: HubCapabilities = {
      global: [],
      application: [
        {
          applicationId: 'app-1',
          capabilities: [{ resource: 'hub.deployment', actions: ['read'] }],
        },
      ],
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: [],
          capabilities: deploymentOnly,
        });
      }
      if (path.endsWith('/deployments/deployment-1')) {
        return response(deployment);
      }
      if (path.endsWith('/deployments/deployment-1/events')) {
        return response([event]);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <HubRuntimeProvider fetcher={fetchMock}>
          <DeploymentDetailPage
            deploymentId='deployment-1'
            fetcher={fetchMock}
          />
        </HubRuntimeProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /deployment-1/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('renders an event timeline and failure details', async () => {
    const failed = {
      ...deployment,
      status: 'failed' as const,
      failure: { code: 'READINESS_FAILED', message: 'Health check failed' },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/deployments/deployment-1')) return response(failed);
      if (path.endsWith('/deployments/deployment-1/events'))
        return response([event]);
      if (path.endsWith('/me'))
        return response({
          user: null,
          roles: ['Viewer'],
          capabilities: readOnly,
        });
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <DeploymentDetailPage deploymentId='deployment-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /deployment-1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: /deployment events/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Readiness checks passed'),
    ).toBeInTheDocument();
    expect(screen.getByText('Health check failed')).toBeInTheDocument();
  });

  it('localizes deployment failure and event details in Simplified Chinese', async () => {
    await portalI18nReady;
    await i18n.changeLanguage('zh-CN');
    const failed = {
      ...deployment,
      status: 'failed' as const,
      failure: { code: 'READINESS_FAILED', message: 'Health check failed' },
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/deployments/deployment-1')) return response(failed);
      if (path.endsWith('/deployments/deployment-1/events')) {
        return response([event]);
      }
      if (path.endsWith('/me')) {
        return response({
          user: null,
          roles: ['Viewer'],
          capabilities: readOnly,
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter>
        <Refine i18nProvider={i18nProvider}>
          <DeploymentDetailPage
            deploymentId='deployment-1'
            fetcher={fetchMock}
          />
        </Refine>
      </MemoryRouter>,
    );

    expect(await screen.findByText('就绪检查已通过。')).toBeInTheDocument();
    expect(screen.getByText('就绪检查失败')).toBeInTheDocument();
    expect(screen.getByText('运行时就绪检查失败。')).toBeInTheDocument();
    expect(screen.queryByText('Health check failed')).not.toBeInTheDocument();
    expect(screen.queryByText('READINESS_FAILED')).not.toBeInTheDocument();
  });

  it('offers a retry action after a failed request', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 'UNAVAILABLE', message: 'Service unavailable' },
            requestId: 'req',
          }),
          {
            status: 503,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );

    render(
      <MemoryRouter>
        <DeploymentDetailPage deploymentId='deployment-1' fetcher={fetchMock} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Service unavailable')).toBeInTheDocument();
    const requestsBeforeRetry = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledTimes(requestsBeforeRetry + 1),
    );
  });
});
