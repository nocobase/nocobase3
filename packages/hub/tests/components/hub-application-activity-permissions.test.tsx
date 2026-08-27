import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type {
  HubApplication,
  HubCapabilities,
  HubFetcher,
  HubRelease,
} from '@/features/hub/api';
import { ApplicationDetailPage } from '@/pages/applications/detail';

const application: HubApplication = {
  id: 'app-1',
  slug: 'inventory',
  name: 'Inventory',
  description: 'Stock control',
  status: 'active',
  defaultEnvironmentId: 'default',
  activeRelease: null,
  createdBy: 'owner',
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
};

const release: HubRelease = {
  id: 'release-1',
  applicationId: 'app-1',
  version: '1.0.0',
  checksum: 'sha256:release',
  manifest: {},
  sizeBytes: 100,
  verificationStatus: 'verified',
  createdBy: 'owner',
  createdAt: '2026-08-21T09:00:00.000Z',
};

function response<T>(
  data: T,
  meta = { total: 1, limit: 20, offset: 0 },
): Response {
  return Response.json({ data, meta, requestId: 'application-detail-test' });
}

function renderDetail(fetcher: HubFetcher): void {
  render(
    <MemoryRouter>
      <ApplicationDetailPage applicationId='app-1' fetcher={fetcher} />
    </MemoryRouter>,
  );
}

describe('application activity and permissions', () => {
  it('loads application-scoped audit records with pagination and export', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.auditLog', actions: ['read', 'export'] },
      ],
      application: [],
    };
    const firstPage = [
      {
        id: 'audit-1',
        actor: {
          type: 'user',
          id: 'owner',
          name: 'Owner',
          email: 'owner@example.com',
        },
        application: { id: 'app-1', name: 'Inventory', slug: 'inventory' },
        action: 'deployment.succeeded',
        resource: 'deployment',
        resourceId: 'deployment-1',
        result: 'success',
        source: 'web',
        createdAt: '2026-08-25T01:00:00.000Z',
      },
    ];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) return response([release]);
      if (path.endsWith('/apps/app-1/deployments')) return response([]);
      if (path.endsWith('/audit-logs?applicationId=app-1')) {
        return response(firstPage, { total: 21, limit: 20, offset: 0 });
      }
      if (path.endsWith('/audit-logs?applicationId=app-1&limit=20&offset=20')) {
        return response([], { total: 21, limit: 20, offset: 20 });
      }
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Owner'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderDetail(fetcher);
    fireEvent.click(await screen.findByRole('tab', { name: 'Activity' }));

    expect(await screen.findByText('Deployment succeeded')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export audit CSV' }),
    ).toHaveAttribute('href', '/hub/api/audit-logs.csv?applicationId=app-1');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/hub/api/audit-logs?applicationId=app-1&limit=20&offset=20',
        expect.objectContaining({ method: 'GET' }),
      ),
    );
  });

  it('adds an application authorization using a member and the current ETag', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.member', actions: ['read'] },
        { resource: 'hub.permission', actions: ['read', 'assign'] },
      ],
      application: [],
    };
    let savedBody: string | undefined;
    let savedIfMatch: string | null = null;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) return response([]);
      if (path.endsWith('/apps/app-1/deployments')) return response([]);
      if (path.endsWith('/apps/app-1/access')) return response([]);
      if (path.endsWith('/apps/app-1/access?limit=1&offset=0')) {
        const result = response([]);
        result.headers.set('etag', '"rev-8"');
        return result;
      }
      if (path.endsWith('/apps/app-1/access/member-2')) {
        savedBody = String(init?.body);
        savedIfMatch = new Headers(init?.headers).get('if-match');
        return response({ revision: 9, roles: ['developer'] });
      }
      if (path.endsWith('/members?status=active&sort=name')) {
        return response([
          {
            id: 'member-2',
            name: 'Alice',
            email: 'alice@example.com',
            username: 'alice',
            status: 'active',
            revision: 3,
            createdAt: '2026-08-20T10:00:00.000Z',
            globalRoles: [],
            visibleApplicationCount: 0,
          },
        ]);
      }
      if (path.endsWith('/roles')) {
        return response([
          {
            id: 'developer',
            key: 'developer',
            name: 'Developer',
            scope: 'application',
            scopes: ['application'],
            capabilities: [],
          },
        ]);
      }
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Admin'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    renderDetail(fetcher);
    fireEvent.click(await screen.findByRole('tab', { name: 'Permissions' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add authorization' }),
    );

    fireEvent.change(await screen.findByRole('combobox', { name: 'Member' }), {
      target: { value: 'member-2' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Developer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save authorization' }));

    await waitFor(() =>
      expect(savedBody).toBe(JSON.stringify({ roles: ['developer'] })),
    );
    expect(savedIfMatch).toBe('"rev-8"');
  });
});
