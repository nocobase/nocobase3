// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';
import {
  HubManagementStore,
  type ManagementRoleDefinition,
} from '../../server/hub/management-store.ts';

const roles: readonly ManagementRoleDefinition[] = [
  { id: 'owner', scopes: ['global'], preservesOwnership: true },
  { id: 'admin', scopes: ['global'] },
  { id: 'developer', scopes: ['global', 'application'] },
  { id: 'viewer', scopes: ['global', 'application'] },
];

let database: HubDatabaseRuntime;
let store: HubManagementStore;

beforeEach(async () => {
  database = createHubDatabase({ filename: ':memory:' });
  await database.ready;
  store = new HubManagementStore(database.connection, { roles });
});

afterEach(async () => {
  await database.close();
});

describe('HubManagementStore applications', () => {
  it('filters, sorts, paginates, and applies revision-protected mutations', async () => {
    await seedUser('owner-1', 'Owner', 'owner@example.com');
    await seedApplication({
      id: 'app-alpha',
      slug: 'alpha',
      name: 'Alpha CRM',
      status: 'active',
      isDefault: true,
      revision: 2,
      createdAt: '2026-08-20T08:00:00.000Z',
    });
    await seedApplication({
      id: 'app-beta',
      slug: 'beta',
      name: 'Beta Desk',
      status: 'archived',
      revision: 4,
      createdAt: '2026-08-21T08:00:00.000Z',
    });
    await seedApplication({
      id: 'app-gamma',
      slug: 'gamma',
      name: 'Gamma',
      status: 'active',
      revision: 1,
      createdAt: '2026-08-22T08:00:00.000Z',
    });

    await expect(
      store.listApplications({
        query: 'a',
        statuses: ['active'],
        sort: 'name',
        limit: 1,
        offset: 0,
      }),
    ).resolves.toMatchObject({
      total: 2,
      limit: 1,
      offset: 0,
      items: [
        expect.objectContaining({
          id: 'app-alpha',
          isDefault: true,
          revision: 2,
        }),
      ],
    });

    const updated = await store.updateApplication(
      'app-alpha',
      { name: 'Alpha Sales', description: 'Updated' },
      2,
    );
    expect(updated).toMatchObject({ name: 'Alpha Sales', revision: 3 });
    await expect(
      store.updateApplication('app-alpha', { name: 'Stale write' }, 2),
    ).rejects.toMatchObject({ code: 'REVISION_MISMATCH', status: 412 });

    const archived = await store.archiveApplication('app-alpha', 3);
    expect(archived).toMatchObject({
      application: { status: 'archived', revision: 4 },
      idempotent: false,
    });
    await expect(
      store.archiveApplication('app-alpha', 4),
    ).resolves.toMatchObject({
      application: { revision: 4 },
      idempotent: true,
    });
    await expect(
      store.restoreApplication('app-alpha', 3),
    ).rejects.toMatchObject({ code: 'REVISION_MISMATCH', status: 412 });
    await expect(
      store.restoreApplication('app-alpha', 4),
    ).resolves.toMatchObject({
      application: { status: 'active', revision: 5 },
      idempotent: false,
    });
  });
});

describe('HubManagementStore releases', () => {
  it('manages retention and never exposes release storage keys', async () => {
    await seedUser('owner-1', 'Owner', 'owner@example.com');
    await seedApplication({ id: 'app-1', slug: 'app-one', name: 'App One' });

    await seedRelease({
      id: 'release-1',
      applicationId: 'app-1',
      version: '1.0.0',
      storageKey: '/private/releases/release-1',
      createdAt: '2026-08-20T08:00:00.000Z',
    });
    const release = await store.getRelease('app-1', 'release-1');
    expect(release).toMatchObject({
      id: 'release-1',
      retention: { pinned: false, pinnedBy: null, pinnedAt: null },
    });
    expect(release).not.toHaveProperty('storageKey');

    const pinned = await store.pinRelease('app-1', 'release-1', 'owner-1');
    expect(pinned.release.retention).toMatchObject({
      pinned: true,
      pinnedBy: 'owner-1',
    });
    expect(
      (await store.pinRelease('app-1', 'release-1', 'owner-1')).idempotent,
    ).toBe(true);
    const unpinned = await store.unpinRelease('app-1', 'release-1');
    expect(unpinned.release.retention.pinned).toBe(false);
  });
});

describe('HubManagementStore members and access', () => {
  it('uses assignment revisions and never removes or disables the only owner', async () => {
    await seedUser('owner-1', 'First Owner', 'owner1@example.com');
    await seedUser('owner-2', 'Second Owner', 'owner2@example.com');
    await seedUser('developer-1', 'Developer', 'developer@example.com');
    await seedMemberStatus('owner-1');
    await seedMemberStatus('owner-2');
    await seedMemberStatus('developer-1');
    await seedApplication({ id: 'app-1', slug: 'app-one', name: 'App One' });
    await seedRoleAssignment('owner-assignment', 'owner-1', 'owner', null);
    await seedRoleAssignment(
      'developer-assignment',
      'developer-1',
      'developer',
      'app-1',
    );
    await seedAssignmentRevision('member', 'owner-1', 1);
    await seedAssignmentRevision('member', 'owner-2', 1);
    await seedAssignmentRevision('member', 'developer-1', 1);
    await seedAssignmentRevision('application', 'app-1', 1);

    await expect(
      store.listMembers({ query: 'developer', role: 'developer' }),
    ).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: 'developer-1', status: 'active' })],
    });
    await expect(store.getMemberAccess('owner-1')).resolves.toMatchObject({
      revision: 1,
      globalRoles: ['owner'],
    });
    await expect(
      store.replaceMemberAccess(
        'owner-1',
        { globalRoles: [], applications: [] },
        1,
      ),
    ).rejects.toMatchObject({ code: 'LAST_OWNER_REQUIRED', status: 409 });

    await store.replaceMemberAccess(
      'owner-2',
      { globalRoles: ['owner'], applications: [] },
      1,
    );
    await expect(
      store.replaceMemberAccess(
        'owner-1',
        { globalRoles: [], applications: [] },
        1,
      ),
    ).resolves.toMatchObject({ revision: 2, globalRoles: [] });
    await expect(
      store.updateMemberStatus('owner-2', 'disabled', 1, 'owner-1'),
    ).rejects.toMatchObject({ code: 'LAST_OWNER_REQUIRED', status: 409 });

    const appAccess = await store.replaceApplicationMemberAccess(
      'app-1',
      'developer-1',
      ['viewer'],
      1,
    );
    expect(appAccess).toMatchObject({ revision: 2, roles: ['viewer'] });
    await expect(store.getMemberAccess('developer-1')).resolves.toMatchObject({
      revision: 2,
      applications: [{ applicationId: 'app-1', roles: ['viewer'] }],
    });
    await expect(store.listApplicationAccess('app-1')).resolves.toMatchObject({
      revision: 2,
      items: [
        expect.objectContaining({
          member: expect.objectContaining({ id: 'developer-1' }),
          roles: ['viewer'],
        }),
      ],
    });
    await expect(
      store.replaceMemberAccess(
        'developer-1',
        { globalRoles: [], applications: [] },
        2,
      ),
    ).resolves.toMatchObject({ revision: 3, applications: [] });
    await expect(store.listApplicationAccess('app-1')).resolves.toMatchObject({
      revision: 3,
      total: 0,
    });
  });

  it('sorts members and filters application access before pagination', async () => {
    await seedUser('member-zulu', 'Zulu', 'zulu@example.com');
    await seedUser('member-alpha', 'Alpha', 'alpha@example.com');
    await seedUser('member-disabled', 'Disabled', 'disabled@example.com');
    await seedMemberStatus('member-zulu');
    await seedMemberStatus('member-alpha');
    await seedMemberStatus('member-disabled', 'disabled');
    await seedApplication({ id: 'app-1', slug: 'app-one', name: 'App One' });
    await seedRoleAssignment(
      'assignment-zulu',
      'member-zulu',
      'developer',
      'app-1',
    );
    await seedRoleAssignment(
      'assignment-alpha',
      'member-alpha',
      'viewer',
      'app-1',
    );
    await seedRoleAssignment(
      'assignment-disabled',
      'member-disabled',
      'developer',
      'app-1',
    );
    await seedAssignmentRevision('application', 'app-1', 3);

    await expect(
      store.listMembers({ sort: 'name', limit: 1, offset: 1 }),
    ).resolves.toMatchObject({
      total: 3,
      items: [expect.objectContaining({ id: 'member-disabled' })],
    });
    await expect(store.listMembers({ sort: '-name' })).resolves.toMatchObject({
      items: [
        { id: 'member-zulu' },
        { id: 'member-disabled' },
        { id: 'member-alpha' },
      ],
    });
    await expect(
      store.listApplicationAccess('app-1', {
        query: 'example.com',
        status: 'active',
        role: 'developer',
        sort: '-name',
        limit: 1,
        offset: 0,
      }),
    ).resolves.toMatchObject({
      revision: 3,
      total: 1,
      items: [
        expect.objectContaining({
          member: expect.objectContaining({ id: 'member-zulu' }),
          roles: ['developer'],
        }),
      ],
    });
  });
});

describe('HubManagementStore audit and settings', () => {
  it('filters audit rows on the server and strips sensitive detail fields', async () => {
    await seedUser('owner-1', 'Owner', 'owner@example.com');
    await seedApplication({ id: 'app-1', slug: 'sales', name: 'Sales' });
    await store.appendAuditLog({
      actorId: 'owner-1',
      applicationId: 'app-1',
      action: 'application.updated',
      resource: 'application',
      resourceId: 'app-1',
      result: 'success',
      source: 'web',
      client: { name: 'Chrome', ip: '127.0.0.1' },
      details: {
        field: 'name',
        token: 'must-not-be-stored',
        nested: { password: 'must-not-be-stored', kept: true },
      },
      requestId: 'request-1',
    });
    await store.appendAuditLog({
      actorId: 'owner-1',
      applicationId: null,
      action: 'settings.updated',
      resource: 'settings',
      resourceId: null,
      result: 'failure',
      source: 'web',
      failureCode: 'REVISION_MISMATCH',
      details: {},
      requestId: 'request-2',
    });

    await expect(
      store.listAuditLogs({
        applicationId: 'app-1',
        result: 'success',
        source: 'web',
        query: 'sales',
        limit: 1,
      }),
    ).resolves.toMatchObject({
      total: 1,
      items: [
        expect.objectContaining({
          action: 'application.updated',
          application: expect.objectContaining({ id: 'app-1', slug: 'sales' }),
        }),
      ],
    });
    const detail = await store.getAuditLogByRequestId('request-1');
    expect(detail?.details).toEqual({ field: 'name', nested: { kept: true } });
    expect(JSON.stringify(detail)).not.toContain('must-not-be-stored');
  });

  it('merge-patches settings with revision checks and keeps cleanup disabled', async () => {
    await expect(store.getSettings()).resolves.toMatchObject({
      revision: 1,
      releaseRetention: {
        automaticCleanupEnabled: false,
        keepPerApplication: 10,
        minimumAgeDays: 30,
      },
    });
    const updated = await store.patchSettings(
      {
        releaseRetention: {
          automaticCleanupEnabled: true,
          keepPerApplication: 5,
        },
        confirmation: { rollback: false },
      },
      1,
    );
    expect(updated).toMatchObject({
      revision: 2,
      releaseRetention: {
        automaticCleanupEnabled: false,
        keepPerApplication: 5,
        minimumAgeDays: 30,
      },
      confirmation: { rollback: false, archiveApplication: true },
    });
    await expect(
      store.patchSettings({ audit: { retentionDays: 30 } }, 1),
    ).rejects.toMatchObject({ code: 'REVISION_MISMATCH', status: 412 });
  });

  it('enforces the configured audit retention before returning logs', async () => {
    const oldAuditId = crypto.randomUUID();
    const recentAuditId = crypto.randomUUID();
    await database.connection.query
      .insertInto('hubAuditLogs')
      .values([
        {
          id: oldAuditId,
          actorId: null,
          applicationId: null,
          action: 'settings.updated',
          resource: 'hub',
          resourceId: null,
          result: 'success',
          source: 'system',
          client: null,
          failureCode: null,
          details: '{}',
          requestId: 'old-audit',
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
        },
        {
          id: recentAuditId,
          actorId: null,
          applicationId: null,
          action: 'settings.updated',
          resource: 'hub',
          resourceId: null,
          result: 'success',
          source: 'system',
          client: null,
          failureCode: null,
          details: '{}',
          requestId: 'recent-audit',
          createdAt: new Date(),
        },
      ])
      .execute();

    await store.patchSettings({ audit: { retentionDays: 30 } }, 1);

    await expect(store.listAuditLogs()).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ id: recentAuditId })],
    });
    await expect(store.getAuditLog(oldAuditId)).resolves.toBeUndefined();
    await expect(
      database.connection.query
        .selectFrom('hubAuditLogs')
        .select('id')
        .where('id', '=', oldAuditId)
        .executeTakeFirst(),
    ).resolves.toBeUndefined();
  });
});

describe('HubManagementStore cleanup planning', () => {
  it('returns only safe database identifiers and protects active and pinned releases', async () => {
    await seedUser('owner-1', 'Owner', 'owner@example.com');
    await seedApplication({
      id: 'app-1',
      slug: 'app-one',
      name: 'App One',
      activeReleaseId: 'release-active',
    });
    await seedRelease({
      id: 'release-old',
      applicationId: 'app-1',
      version: '1.0.0',
      storageKey: '/private/old',
      createdAt: '2025-01-01T00:00:00.000Z',
      sizeBytes: 100,
    });
    await seedRelease({
      id: 'release-pinned',
      applicationId: 'app-1',
      version: '1.1.0',
      storageKey: '/private/pinned',
      createdAt: '2025-02-01T00:00:00.000Z',
      sizeBytes: 200,
    });
    await seedRelease({
      id: 'release-active',
      applicationId: 'app-1',
      version: '2.0.0',
      storageKey: '/private/active',
      createdAt: '2025-03-01T00:00:00.000Z',
      sizeBytes: 300,
    });
    await seedRelease({
      id: 'release-running',
      applicationId: 'app-1',
      version: '1.5.0',
      storageKey: '/private/running',
      createdAt: '2025-02-15T00:00:00.000Z',
      sizeBytes: 400,
    });
    await seedApplication({
      id: 'app-2',
      slug: 'app-two',
      name: 'App Two',
    });
    await seedRelease({
      id: 'release-kept',
      applicationId: 'app-2',
      version: '2.0.0',
      storageKey: '/private/kept',
      createdAt: '2025-04-01T00:00:00.000Z',
      sizeBytes: 50,
    });
    await seedRelease({
      id: 'release-large-b',
      applicationId: 'app-2',
      version: '1.2.0',
      storageKey: '/private/large-b',
      createdAt: '2025-03-01T00:00:00.000Z',
      sizeBytes: 500,
    });
    await seedRelease({
      id: 'release-large-a',
      applicationId: 'app-2',
      version: '1.1.0',
      storageKey: '/private/large-a',
      createdAt: '2025-02-01T00:00:00.000Z',
      sizeBytes: 500,
    });
    await database.connection.query
      .insertInto('hubDeployments')
      .values({
        id: 'deployment-running',
        applicationId: 'app-1',
        environmentId: 'default',
        targetReleaseId: 'release-running',
        previousReleaseId: 'release-pinned',
        type: 'deploy',
        status: 'activating',
        requestedBy: 'owner-1',
        idempotencyKey: null,
        hostOperationId: null,
        startedAt: new Date('2025-02-16T00:00:00.000Z'),
        finishedAt: null,
        failureCode: null,
        failureMessage: null,
        createdAt: new Date('2025-02-16T00:00:00.000Z'),
      })
      .execute();
    await database.connection.query
      .insertInto('hubReleaseRetentions')
      .values({
        releaseId: 'release-pinned',
        pinned: true,
        pinnedBy: 'owner-1',
        pinnedAt: new Date('2025-02-02T00:00:00.000Z'),
        updatedAt: new Date('2025-02-02T00:00:00.000Z'),
      })
      .execute();
    await store.patchSettings(
      { releaseRetention: { keepPerApplication: 1, minimumAgeDays: 30 } },
      1,
    );

    const measuredAt = new Date('2026-08-25T00:00:00.000Z');
    const plan = await store.getStorageCleanupPlanData(measuredAt, {
      limit: 2,
      offset: 0,
    });
    expect(plan).toMatchObject({
      automaticCleanupEnabled: false,
      total: 3,
      limit: 2,
      offset: 0,
      totalReclaimableBytes: 1100,
      protectedCounts: {
        activeRelease: 1,
        deploymentReference: 2,
        pinned: 1,
      },
      measuredAt: '2026-08-25T00:00:00.000Z',
      releaseCandidates: [
        { id: 'release-large-a', applicationId: 'app-2', sizeBytes: 500 },
        { id: 'release-large-b', applicationId: 'app-2', sizeBytes: 500 },
      ],
    });
    await expect(
      store.getStorageCleanupPlanData(measuredAt, { limit: 2, offset: 2 }),
    ).resolves.toMatchObject({
      total: 3,
      limit: 2,
      offset: 2,
      totalReclaimableBytes: 1100,
      releaseCandidates: [
        { id: 'release-old', applicationId: 'app-1', sizeBytes: 100 },
      ],
    });
    expect(JSON.stringify(plan)).not.toContain('/private/');
    expect(JSON.stringify(plan)).not.toContain('storageKey');
  });
});

interface SeedApplicationOptions {
  id: string;
  slug: string;
  name: string;
  status?: 'active' | 'archived';
  isDefault?: boolean;
  revision?: number;
  activeReleaseId?: string | null;
  createdAt?: string;
}

async function seedApplication(options: SeedApplicationOptions): Promise<void> {
  const createdAt = new Date(options.createdAt ?? '2026-08-20T08:00:00.000Z');
  await database.connection.query
    .insertInto('hubApplications')
    .values({
      id: options.id,
      slug: options.slug,
      name: options.name,
      description: null,
      status: options.status ?? 'active',
      defaultEnvironmentId: 'default',
      activeReleaseId: options.activeReleaseId ?? null,
      createdBy: 'owner-1',
      createdAt,
      updatedAt: createdAt,
      isDefault: options.isDefault ?? false,
      revision: options.revision ?? 1,
    })
    .execute();
}

async function seedUser(
  id: string,
  name: string,
  email: string,
): Promise<void> {
  const now = new Date('2026-08-20T08:00:00.000Z');
  await database.connection.query
    .insertInto('user')
    .values({
      id,
      name,
      username: id,
      email,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function seedMemberStatus(
  userId: string,
  status: 'active' | 'disabled' = 'active',
): Promise<void> {
  const now = new Date('2026-08-20T08:00:00.000Z');
  await database.connection.query
    .insertInto('hubMemberStatuses')
    .values({
      userId,
      status,
      disabledAt: status === 'disabled' ? now : null,
      disabledBy: status === 'disabled' ? 'owner-1' : null,
      lastActiveAt: null,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function seedRoleAssignment(
  id: string,
  userId: string,
  role: string,
  applicationId: string | null,
): Promise<void> {
  const now = new Date('2026-08-20T08:00:00.000Z');
  await database.connection.query
    .insertInto('hubRoleAssignments')
    .values({
      id,
      userId,
      role,
      applicationId,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
}

async function seedAssignmentRevision(
  scopeType: 'application' | 'member',
  scopeId: string,
  revision: number,
): Promise<void> {
  await database.connection.query
    .insertInto('hubAssignmentRevisions')
    .values({
      scopeType,
      scopeId,
      revision,
      updatedAt: new Date('2026-08-20T08:00:00.000Z'),
    })
    .execute();
}

interface SeedReleaseOptions {
  id: string;
  applicationId: string;
  version: string;
  storageKey: string;
  createdAt: string;
  sizeBytes?: number;
}

async function seedRelease(options: SeedReleaseOptions): Promise<void> {
  await database.connection.query
    .insertInto('hubReleases')
    .values({
      id: options.id,
      applicationId: options.applicationId,
      version: options.version,
      checksum: `sha256:${options.id}`,
      manifest: JSON.stringify({ schemaVersion: 1 }),
      storageKey: options.storageKey,
      sizeBytes: options.sizeBytes ?? 100,
      verificationStatus: 'verified',
      createdBy: 'owner-1',
      createdAt: new Date(options.createdAt),
    })
    .execute();
}
