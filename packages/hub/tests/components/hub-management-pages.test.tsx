import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import {
  HubAgentAuthorizationPage,
  HubInvitationAcceptancePage,
} from '@/features/hub/auth-pages';
import { AuditLogPage } from '@/pages/audit/list';
import { MembersPage } from '@/pages/members/list';
import { HubSettingsPage } from '@/pages/settings';
import { HubRuntimeProvider } from '@/features/hub/provider';

function response<T>(data: T, total = Array.isArray(data) ? data.length : 1) {
  return Response.json({
    data,
    meta: { total, limit: 20, offset: 0 },
    requestId: 'management-test',
  });
}

describe('Hub management pages', () => {
  it('renders server-paginated audit records and preserves filters in export', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/apps?limit=100&offset=0&sort=name')) {
        return response([]);
      }
      if (path.endsWith('/me')) {
        return response({
          user: { id: 'owner', name: 'Owner', email: 'owner@example.com' },
          roles: ['owner'],
          capabilities: {
            global: [{ resource: 'hub.auditLog', actions: ['read', 'export'] }],
            application: [],
          },
        });
      }
      if (path.endsWith('/audit-logs?sort=-createdAt')) {
        return response([
          {
            id: 'audit-1',
            actor: {
              type: 'user',
              id: 'member-1',
              name: 'Alice',
              email: 'alice@example.com',
            },
            application: { id: 'app-1', name: 'Inventory', slug: 'inventory' },
            action: 'deployment.succeeded',
            resource: 'deployment',
            resourceId: 'deployment-1',
            result: 'success',
            source: 'web',
            createdAt: '2026-08-25T01:00:00.000Z',
          },
        ]);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<AuditLogPage fetcher={fetcher} />);

    expect(await screen.findByText('Deployment succeeded')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Export audit CSV' }),
    ).toHaveAttribute('href', '/hub/api/audit-logs.csv?sort=-createdAt');
  });

  it('hides audit export when an application-scoped reader cannot export', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/me')) {
        return response({
          user: {
            id: 'viewer',
            name: 'Viewer',
            email: 'viewer@example.com',
          },
          roles: [],
          capabilities: {
            global: [],
            application: [
              {
                applicationId: 'app-1',
                capabilities: [{ resource: 'hub.auditLog', actions: ['read'] }],
              },
            ],
          },
        });
      }
      if (path.endsWith('/apps?limit=100&offset=0&sort=name')) {
        return response([{ id: 'app-1', name: 'Inventory' }]);
      }
      if (path.endsWith('/audit-logs?sort=-createdAt')) return response([]);
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <HubRuntimeProvider fetcher={fetcher}>
        <AuditLogPage fetcher={fetcher} />
      </HubRuntimeProvider>,
    );

    expect(await screen.findByText('No audit events')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export audit CSV' }),
    ).toBeNull();
  });

  it('shows the read-only Deployer role and opens the invitation flow', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/members?sort=name')) return response([]);
      if (path.endsWith('/apps?limit=100&offset=0&sort=name'))
        return response([]);
      if (path.endsWith('/roles')) {
        return response([
          {
            key: 'deployer',
            name: 'Deployer',
            scope: 'application',
            capabilities: [
              {
                resource: 'hub.deployment',
                actions: ['read', 'deploy', 'rollback', 'redeploy'],
              },
            ],
          },
        ]);
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<MembersPage fetcher={fetcher} />);
    fireEvent.click(await screen.findByRole('button', { name: 'View roles' }));

    expect(await screen.findByText('Deployer')).toBeInTheDocument();
    expect(
      screen.getByText('View, Deploy, Roll back, Redeploy'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Invite member' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/does not send email automatically/i),
    ).toBeInTheDocument();
  });

  it('replaces member access with optimistic concurrency protection', async () => {
    let savedAccess: Record<string, unknown> | undefined;
    let ifMatch: string | null = null;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/members?sort=name')) {
        return response([
          {
            id: 'member-1',
            name: 'Alice',
            email: 'alice@example.com',
            username: 'alice',
            status: 'active',
            globalRoles: ['viewer'],
            visibleApplicationCount: 1,
            lastActiveAt: '2026-08-25T01:00:00.000Z',
            createdAt: '2026-08-20T01:00:00.000Z',
            revision: 7,
          },
        ]);
      }
      if (path.endsWith('/apps?limit=100&offset=0&sort=name')) {
        return response([{ id: 'app-1', name: 'Inventory' }]);
      }
      if (path.endsWith('/roles')) {
        return response([
          {
            key: 'developer',
            name: 'Developer',
            scope: 'application',
            scopes: ['global', 'application'],
            capabilities: [],
          },
          {
            key: 'viewer',
            name: 'Viewer',
            scope: 'application',
            scopes: ['global', 'application'],
            capabilities: [],
          },
        ]);
      }
      if (path.endsWith('/members/member-1/access')) {
        if (init?.method === 'PUT') {
          savedAccess = JSON.parse(String(init.body)) as Record<
            string,
            unknown
          >;
          ifMatch = new Headers(init.headers).get('if-match');
          return response({
            revision: 4,
            globalRoles: ['developer'],
            applications: [{ applicationId: 'app-1', roles: ['viewer'] }],
          });
        }
        return response({
          revision: 3,
          globalRoles: ['viewer'],
          applications: [{ applicationId: 'app-1', roles: ['developer'] }],
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<MembersPage fetcher={fetcher} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit access for Alice' }),
    );

    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: 'Global role Developer',
      }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Global role Viewer' }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Inventory application role Developer',
      }),
    );
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: 'Inventory application role Viewer',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save access' }));

    await waitFor(() => {
      expect(savedAccess).toEqual({
        globalRoles: ['developer'],
        applications: [{ applicationId: 'app-1', roles: ['viewer'] }],
      });
    });
    expect(ifMatch).toBe('"rev-3"');
  });

  it('confirms and shows progress before disabling a member', async () => {
    let memberDisabled = false;
    let resolveDisable: ((value: Response) => void) | undefined;
    const disableResponse = new Promise<Response>((resolve) => {
      resolveDisable = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/members?sort=name')) {
        return response([
          {
            id: 'member-1',
            name: 'Alice',
            email: 'alice@example.com',
            username: 'alice',
            status: memberDisabled ? 'disabled' : 'active',
            globalRoles: ['viewer'],
            visibleApplicationCount: 1,
            lastActiveAt: '2026-08-25T01:00:00.000Z',
            createdAt: '2026-08-20T01:00:00.000Z',
            revision: 7,
          },
        ]);
      }
      if (path.endsWith('/apps?limit=100&offset=0&sort=name')) {
        return response([]);
      }
      if (path.endsWith('/roles')) return response([]);
      if (path.endsWith('/members/member-1')) {
        expect(init?.method).toBe('PATCH');
        expect(init?.body).toBe(JSON.stringify({ status: 'disabled' }));
        return disableResponse;
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<MembersPage fetcher={fetcher} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Disable member' }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/members/member-1') &&
          init?.method === 'PATCH',
      ),
    ).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm disable' }));

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/hub/api/members/member-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'disabled' }),
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Disabling…' })).toBeDisabled();

    memberDisabled = true;
    resolveDisable?.(
      response({
        id: 'member-1',
        name: 'Alice',
        email: 'alice@example.com',
        username: 'alice',
        status: 'disabled',
        revision: 8,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );
  });

  it('filters, paginates, and revokes invitations', async () => {
    let listRefreshesAfterRevoke = 0;
    let revoked = false;
    let resolveRevoke: ((value: Response) => void) | undefined;
    const revokeResponse = new Promise<Response>((resolve) => {
      resolveRevoke = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/members?sort=name')) return response([]);
      if (path.endsWith('/apps?limit=100&offset=0&sort=name')) {
        return response([]);
      }
      if (path.endsWith('/roles')) return response([]);
      if (path.endsWith('/invitations/invite-1')) {
        expect(init?.method).toBe('DELETE');
        return revokeResponse;
      }
      if (path.includes('/invitations?')) {
        if (revoked) listRefreshesAfterRevoke += 1;
        return response(
          [
            {
              id: 'invite-1',
              email: 'developer@example.com',
              access: {
                globalRoles: [],
                applications: [
                  { applicationId: 'app-1', roles: ['developer'] },
                ],
              },
              status: 'pending',
              invitedBy: 'owner',
              expiresAt: '2026-09-01T08:00:00.000Z',
              acceptedBy: null,
              acceptedAt: null,
              revokedAt: null,
              createdAt: '2026-08-25T08:00:00.000Z',
              updatedAt: '2026-08-25T08:00:00.000Z',
            },
          ],
          25,
        );
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<MembersPage fetcher={fetcher} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Invitations' }));

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringMatching(/\/invitations\?sort=-createdAt$/),
        expect.anything(),
      );
    });
    fireEvent.change(screen.getByLabelText('Filter by invitation status'), {
      target: { value: 'pending' },
    });
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringMatching(/\/invitations\?sort=-createdAt&status=pending$/),
        expect.anything(),
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/invitations\?sort=-createdAt&status=pending&limit=20&offset=20$/,
        ),
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Revoke invitation' }),
    ).toBeInTheDocument();
    expect(revoked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/hub/api/invitations/invite-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Revoking…' })).toBeDisabled();

    revoked = true;
    resolveRevoke?.(response({ id: 'invite-1', status: 'revoked' }));
    await waitFor(() => expect(revoked).toBe(true));
    await waitFor(() => expect(listRefreshesAfterRevoke).toBeGreaterThan(0));
  });

  it('filters, paginates, and revokes the current user Agent credentials', async () => {
    let listRefreshesAfterRevoke = 0;
    let revoked = false;
    let resolveRevoke: ((value: Response) => void) | undefined;
    const revokeResponse = new Promise<Response>((resolve) => {
      resolveRevoke = resolve;
    });
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path.endsWith('/members?sort=name')) return response([]);
      if (path.endsWith('/apps?limit=100&offset=0&sort=name')) {
        return response([]);
      }
      if (path.endsWith('/roles')) return response([]);
      if (path.endsWith('/agent-credentials/credential-1')) {
        expect(init?.method).toBe('DELETE');
        return revokeResponse;
      }
      if (path.includes('/agent-credentials?')) {
        if (revoked) listRefreshesAfterRevoke += 1;
        return response(
          [
            {
              id: 'credential-1',
              clientId: 'codex',
              clientName: 'Codex on Mac',
              scopes: ['profile', 'apps:read', 'releases:create'],
              applicationScope: {
                mode: 'selected',
                applicationIds: ['app-1'],
              },
              status: 'active',
              createdAt: '2026-08-25T08:00:00.000Z',
              lastUsedAt: '2026-08-25T09:00:00.000Z',
              accessTokenExpiresAt: '2026-08-25T10:00:00.000Z',
              refreshTokenExpiresAt: '2026-09-25T08:00:00.000Z',
              revokedAt: null,
            },
          ],
          25,
        );
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<MembersPage fetcher={fetcher} />);
    fireEvent.click(
      await screen.findByRole('tab', { name: 'Agent credentials' }),
    );

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringMatching(/\/agent-credentials\?sort=-createdAt$/),
        expect.anything(),
      );
    });
    fireEvent.change(screen.getByLabelText('Filter by credential status'), {
      target: { value: 'active' },
    });
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/agent-credentials\?sort=-createdAt&status=active$/,
        ),
        expect.anything(),
      );
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/agent-credentials\?sort=-createdAt&status=active&limit=20&offset=20$/,
        ),
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Revoke credential' }));
    expect(
      screen.getByRole('alertdialog', { name: 'Revoke Agent credential' }),
    ).toBeInTheDocument();
    expect(revoked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith(
        '/hub/api/agent-credentials/credential-1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Revoking…' })).toBeDisabled();

    revoked = true;
    resolveRevoke?.(response({ revoked: true }));
    await waitFor(() => expect(revoked).toBe(true));
    await waitFor(() => expect(listRefreshesAfterRevoke).toBeGreaterThan(0));
  });

  it('resolves an invitation from the URL fragment and creates the member without signing in', async () => {
    const token = `nbi_${'a'.repeat(43)}`;
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (path.endsWith('/invitation-acceptance/resolve')) {
        expect(body).toEqual({ token });
        return response({
          email: 'i*****d@example.com',
          hubDisplayName: 'NocoBase Hub',
          access: {
            globalRoles: [],
            applications: [
              {
                name: 'Sales CRM',
                roles: [{ id: 'developer', name: 'Developer' }],
              },
            ],
          },
          expiresAt: '2026-09-01T08:00:00.000Z',
        });
      }
      if (path.endsWith('/invitation-acceptance/accept')) {
        expect(body).toEqual({
          token,
          name: 'Invited Member',
          username: 'invited.member',
          password: 'correct horse battery staple',
        });
        return response({
          id: 'member-2',
          name: 'Invited Member',
          email: 'invited@example.com',
          username: 'invited.member',
          status: 'active',
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter
        initialEntries={[
          `/invitation-acceptance#token=${encodeURIComponent(token)}`,
        ]}
      >
        <HubInvitationAcceptancePage fetcher={fetcher} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('i*****d@example.com')).toBeInTheDocument();
    expect(screen.getByText('Sales CRM')).toBeInTheDocument();
    expect(screen.getByText('Developer')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Invited Member' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'invited.member' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(
      await screen.findByText('Your Hub account is ready'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('resolves and approves a local Coding Agent authorization request', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (path.endsWith('/agent-authorizations/resolve')) {
        expect(body).toEqual({ userCode: 'NB3-W7KM' });
        return response({
          id: 'authorization-1',
          clientId: 'codex',
          clientName: 'Codex on Mac',
          requestedScopes: ['profile', 'apps:read', 'releases:create'],
          requestedApplicationScope: {
            mode: 'selected',
            applicationIds: ['app-1'],
          },
          status: 'pending',
          expiresAt: '2026-09-01T08:00:00.000Z',
        });
      }
      if (path.endsWith('/agent-authorizations/authorization-1/approve')) {
        expect(body).toEqual({
          scopes: ['profile', 'apps:read', 'releases:create'],
          applicationScope: {
            mode: 'selected',
            applicationIds: ['app-1'],
          },
        });
        return response({ status: 'approved' });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(
      <MemoryRouter initialEntries={['/agent-authorize#code=NB3-W7KM']}>
        <HubAgentAuthorizationPage fetcher={fetcher} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Codex on Mac')).toBeInTheDocument();
    expect(screen.getByText('releases:create')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize Agent' }));
    expect(await screen.findByText('Agent authorized')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('explains storage categories and keeps automatic cleanup disabled', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/settings')) {
        return response({
          releaseRetention: {
            automaticCleanupEnabled: false,
            keepPerApplication: 10,
            minimumAgeDays: 30,
          },
          audit: { recordDeniedMutations: true, retentionDays: 365 },
          confirmation: {
            rollback: true,
            archiveApplication: true,
            rotateRuntimeSecret: true,
          },
          readOnly: {
            releaseStorage: 'local',
            hostMode: 'in-process',
            environmentCount: 1,
          },
          revision: 1,
          updatedAt: '2026-08-25T01:00:00.000Z',
        });
      }
      if (path.endsWith('/storage')) {
        return response({
          filesystem: {
            capacityBytes: 10_000,
            usedBytes: 4_000,
            availableBytes: 6_000,
            usedPercent: 40,
          },
          knownUsageBytes: 1_000,
          categories: [
            {
              key: 'releaseArtifacts',
              labelKey: 'storage.releaseArtifacts',
              descriptionKey: 'storage.releaseArtifacts.description',
              bytes: 1_000,
              reclaimableBytes: 0,
              scope: 'hub-managed',
              accuracy: 'exact',
            },
          ],
          measuredAt: '2026-08-25T01:00:00.000Z',
        });
      }
      if (path.endsWith('/storage/cleanup-plan?limit=20&offset=0')) {
        return response({
          totalReclaimableBytes: 0,
          candidates: [],
          protectedCounts: { activeRelease: 1 },
          measuredAt: '2026-08-25T01:00:00.000Z',
        });
      }
      if (path.endsWith('/system-info')) {
        return response({
          hubVersion: '3.1.1',
          nodeVersion: '24.0.0',
          databaseType: 'sqlite',
          hostMode: 'in-process',
          publicBasePath: '/hub',
          startedAt: '2026-08-25T01:00:00.000Z',
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<HubSettingsPage fetcher={fetcher} />);

    expect(await screen.findByText('Release artifacts')).toBeInTheDocument();
    expect(
      screen.getByText(/Verified immutable build artifacts/i),
    ).toBeInTheDocument();
    expect(await screen.findByText('Release retention')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Automatic cleanup' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows cleanup candidates with server-side pagination', async () => {
    const baseSettings = {
      releaseRetention: {
        automaticCleanupEnabled: false,
        keepPerApplication: 10,
        minimumAgeDays: 30,
      },
      audit: { recordDeniedMutations: true, retentionDays: 365 },
      confirmation: {
        rollback: true,
        archiveApplication: true,
        rotateRuntimeSecret: true,
      },
      readOnly: {
        releaseStorage: 'local',
        hostMode: 'in-process',
        environmentCount: 1,
      },
      revision: 1,
      updatedAt: '2026-08-25T01:00:00.000Z',
    };
    const cleanupResponse = (resourceId: string, offset: number) =>
      Response.json({
        data: {
          totalReclaimableBytes: 3_000,
          candidates: [
            {
              kind: 'release',
              applicationId: 'app-1',
              resourceId,
              bytes: offset === 0 ? 2_000 : 1_000,
              reason: 'outside retention window',
            },
          ],
          protectedCounts: { activeRelease: 1, pinned: 2 },
          measuredAt: '2026-08-25T01:00:00.000Z',
        },
        meta: { total: 21, limit: 20, offset },
        requestId: 'cleanup-plan',
      });
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path.endsWith('/settings')) return response(baseSettings);
      if (path.endsWith('/storage')) {
        return response({
          filesystem: {
            capacityBytes: 10_000,
            usedBytes: 4_000,
            availableBytes: 6_000,
            usedPercent: 40,
          },
          knownUsageBytes: 1_000,
          categories: [],
          measuredAt: '2026-08-25T01:00:00.000Z',
        });
      }
      if (path.endsWith('/storage/cleanup-plan?limit=20&offset=0')) {
        return cleanupResponse('release-1', 0);
      }
      if (path.endsWith('/storage/cleanup-plan?limit=20&offset=20')) {
        return cleanupResponse('release-21', 20);
      }
      if (path.endsWith('/system-info')) {
        return response({
          hubVersion: '3.1.1',
          nodeVersion: '24.0.0',
          databaseType: 'sqlite',
          hostMode: 'in-process',
          publicBasePath: '/hub',
          startedAt: '2026-08-25T01:00:00.000Z',
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    render(<HubSettingsPage fetcher={fetcher} />);

    expect(await screen.findByText('release-1')).toBeInTheDocument();
    expect(screen.getByText('Active Release: 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('release-21')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      '/hub/api/storage/cleanup-plan?limit=20&offset=20',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
