import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  HubApplication,
  HubCapabilities,
  HubDeployment,
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
  activeRelease: {
    id: 'release-2',
    version: '1.2.0',
    sourceCommit: 'active',
    createdAt: '2026-08-21T09:00:00.000Z',
  },
  createdBy: 'owner',
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-21T10:00:00.000Z',
  revision: 4,
};

const activeRelease: HubRelease = {
  id: 'release-2',
  applicationId: 'app-1',
  version: '1.2.0',
  checksum: 'sha256:active',
  manifest: {},
  sizeBytes: 2_000,
  sourceCommit: 'active',
  verificationStatus: 'verified',
  createdBy: 'owner',
  createdAt: '2026-08-21T09:00:00.000Z',
};

const rollbackRelease: HubRelease = {
  ...activeRelease,
  id: 'release-1',
  version: '1.0.0',
  checksum: 'sha256:rollback',
  sourceCommit: 'rollback',
  createdAt: '2026-08-20T09:00:00.000Z',
};

const confirmationSettings = {
  releaseRetention: {
    automaticCleanupEnabled: false,
    keepPerApplication: 10,
    minimumAgeDays: 30,
  },
  audit: { recordDeniedMutations: true, retentionDays: 365 },
  confirmation: {
    rollback: false,
    archiveApplication: false,
    rotateRuntimeSecret: false,
  },
  readOnly: {
    sourceStorage: 'local',
    releaseStorage: 'local',
    hostMode: 'in-process',
    environmentCount: 1,
  },
  revision: 1,
  updatedAt: '2026-08-25T01:00:00.000Z',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Hub confirmation policies', () => {
  it('starts a rollback immediately when rollback confirmation is disabled', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read'] },
        { resource: 'hub.deployment', actions: ['read', 'rollback'] },
        { resource: 'hub.setting', actions: ['read'] },
      ],
      application: [],
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1/deployments') && init?.method === 'POST') {
        return response({
          id: 'deployment-rollback',
          applicationId: 'app-1',
          environmentId: 'default',
          targetReleaseId: 'release-1',
          previousReleaseId: 'release-2',
          type: 'rollback',
          status: 'queued',
          requestedBy: 'owner',
          startedAt: null,
          finishedAt: null,
          failure: null,
          createdAt: '2026-08-25T10:00:00.000Z',
        } satisfies HubDeployment);
      }
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) {
        return response([activeRelease, rollbackRelease]);
      }
      if (path.endsWith('/apps/app-1/deployments')) return response([]);
      if (path.endsWith('/settings')) return response(confirmationSettings);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Owner'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={['/apps/app-1']}>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetcher} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Releases' }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([input]) =>
          String(input).endsWith('/settings'),
        ),
      ).toBe(true),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Deploy 1.0.0' }),
    );

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/deployments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            targetReleaseId: 'release-1',
            type: 'rollback',
          }),
        }),
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Confirm deployment' }),
    ).not.toBeInTheDocument();
  });

  it('keeps rollback confirmation enabled when settings are not readable', async () => {
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read'] },
        { resource: 'hub.release', actions: ['read'] },
        { resource: 'hub.deployment', actions: ['read', 'rollback'] },
      ],
      application: [],
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/apps/app-1/releases')) {
        return response([activeRelease, rollbackRelease]);
      }
      if (path.endsWith('/apps/app-1/deployments')) return response([]);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Deployer'], capabilities });
      }
      if (init?.method === 'POST') {
        throw new Error('Rollback was submitted before confirmation.');
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={['/apps/app-1']}>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetcher} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('tab', { name: 'Releases' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Deploy 1.0.0' }),
    );

    expect(
      await screen.findByRole('button', { name: 'Confirm deployment' }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([input]) => String(input).endsWith('/settings')),
    ).toBe(false);
  });

  it('skips archive and secret-rotation prompts when disabled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const capabilities: HubCapabilities = {
      global: [
        { resource: 'hub.app', actions: ['read', 'archive'] },
        { resource: 'hub.runtimeSecret', actions: ['read', 'rotate'] },
        { resource: 'hub.setting', actions: ['read'] },
      ],
      application: [],
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (
        path.endsWith('/apps/app-1/runtime-secret/rotate') &&
        init?.method === 'POST'
      ) {
        return response({
          configured: true,
          version: 2,
          rotatedAt: '2026-08-25T10:00:00.000Z',
        });
      }
      if (path.endsWith('/apps/app-1/archive') && init?.method === 'POST') {
        return response({ ...application, status: 'archived', revision: 5 });
      }
      if (path.endsWith('/apps/app-1/runtime-secret')) {
        return response({ configured: true, version: 1, rotatedAt: null });
      }
      if (path.endsWith('/apps/app-1')) return response(application);
      if (path.endsWith('/settings')) return response(confirmationSettings);
      if (path.endsWith('/me')) {
        return response({ user: null, roles: ['Owner'], capabilities });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={['/apps/app-1?tab=settings']}>
        <ApplicationDetailPage applicationId='app-1' fetcher={fetcher} />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(([input]) =>
          String(input).endsWith('/settings'),
        ),
      ).toBe(true),
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Rotate secret' }),
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/runtime-secret/rotate',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Archive application' }),
    );
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/hub/api/apps/app-1/archive',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(confirm).not.toHaveBeenCalled();
  });
});

function response<T>(data: T): Response {
  return Response.json({
    data,
    meta: {
      total: Array.isArray(data) ? data.length : 1,
      limit: 20,
      offset: 0,
    },
    requestId: 'confirmation-test',
  });
}
