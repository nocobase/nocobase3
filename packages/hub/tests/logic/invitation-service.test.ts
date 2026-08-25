// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  Auth,
  PasswordUserCreationError,
  type PasswordUser,
} from '@nocobase/app-plugin-authentication';
import type { Knex } from 'knex';

import {
  HubInvitationService,
  type InvitationRoleDefinition,
} from '../../server/hub/invitation-service.ts';
import {
  createHubDatabase,
  type HubDatabaseRuntime,
} from '../../server/hub/database.ts';

const roles: readonly InvitationRoleDefinition[] = [
  { id: 'owner', name: 'Owner', scopes: ['global'] },
  { id: 'admin', name: 'Administrator', scopes: ['global'] },
  {
    id: 'developer',
    name: 'Developer',
    scopes: ['global', 'application'],
  },
  {
    id: 'deployer',
    name: 'Deployer',
    scopes: ['global', 'application'],
  },
  { id: 'viewer', name: 'Viewer', scopes: ['global', 'application'] },
];

let database: HubDatabaseRuntime;
let service: HubInvitationService;
let auth: Auth;
let currentTime: Date;

beforeEach(async () => {
  database = createHubDatabase({ filename: ':memory:' });
  await database.ready;
  currentTime = new Date('2026-08-25T08:00:00.000Z');
  auth = new Auth({
    connection: database.connection,
    baseURL: 'http://localhost/hub/api/auth',
    basePath: '/hub/api/auth',
    secret: 'invitation-test-auth-secret-at-least-32-characters',
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      disableSignUp: true,
    },
  });
  service = new HubInvitationService(database.connection, {
    acceptanceUrl: 'https://hub.example.com/hub/invitation-acceptance',
    hubDisplayName: 'NocoBase Hub',
    roles,
    auth,
    clock: () => new Date(currentTime),
  });
  await seedUser('owner-1', 'Owner', 'owner@example.com');
  await seedApplication('app-1', 'Sales CRM');
  await seedApplication('app-2', 'Support Desk');
});

afterEach(async () => {
  await database.close();
});

describe('HubInvitationService creation', () => {
  it('returns the invite URL once while storing only a token hash', async () => {
    const created = await service.createInvitation(
      {
        email: '  Developer@Example.COM ',
        expiresInDays: 7,
        access: {
          globalRoles: [],
          applications: [
            { applicationId: 'app-1', roles: ['developer', 'developer'] },
          ],
        },
      },
      'owner-1',
    );

    expect(created).toMatchObject({
      email: 'developer@example.com',
      status: 'pending',
      invitedBy: 'owner-1',
      expiresAt: '2026-09-01T08:00:00.000Z',
      access: {
        globalRoles: [],
        applications: [{ applicationId: 'app-1', roles: ['developer'] }],
      },
    });
    expect(created.inviteUrl).toMatch(
      /^https:\/\/hub\.example\.com\/hub\/invitation-acceptance#token=nbi_[A-Za-z0-9_-]{43}$/,
    );

    const token = new URL(created.inviteUrl).hash.slice('#token='.length);
    const row = await database.connection.query
      .selectFrom('hubInvitations')
      .selectAll()
      .where('id', '=', created.id)
      .executeTakeFirst();
    expect(String(row?.tokenHash)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(row)).not.toContain(token);
    expect(JSON.stringify(row)).not.toContain(created.inviteUrl);

    const listed = await service.listInvitations();
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).not.toHaveProperty('inviteUrl');
    expect(listed.items[0]).not.toHaveProperty('tokenHash');
  });

  it('allows a trusted per-request acceptance URL to override the constructor URL', async () => {
    const created = await service.createInvitation(
      {
        email: 'port-aware@example.com',
        expiresInDays: 7,
        access: { globalRoles: ['viewer'], applications: [] },
      },
      'owner-1',
      {
        acceptanceUrl: 'http://127.0.0.1:43123/hub/invitation-acceptance',
      },
    );
    expect(created.inviteUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:43123\/hub\/invitation-acceptance#token=nbi_/,
    );

    const requestOnlyService = new HubInvitationService(database.connection, {
      hubDisplayName: 'NocoBase Hub',
      roles,
      auth,
      clock: () => new Date(currentTime),
    });
    await expect(
      requestOnlyService.createInvitation(
        {
          email: 'request-only@example.com',
          expiresInDays: 7,
          access: { globalRoles: ['viewer'], applications: [] },
        },
        'owner-1',
        {
          acceptanceUrl: 'http://127.0.0.1:43123/hub/invitation-acceptance',
        },
      ),
    ).resolves.toMatchObject({
      inviteUrl: expect.stringContaining('http://127.0.0.1:43123/'),
    });
  });

  it('validates role scopes, APP existence, expiry, and non-empty access', async () => {
    await expect(
      service.createInvitation(
        {
          email: 'invalid',
          expiresInDays: 7,
          access: { globalRoles: ['viewer'], applications: [] },
        },
        'owner-1',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
    await expect(
      service.createInvitation(
        {
          email: 'new@example.com',
          expiresInDays: 31,
          access: { globalRoles: ['viewer'], applications: [] },
        },
        'owner-1',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
    await expect(
      service.createInvitation(
        {
          email: 'new@example.com',
          expiresInDays: 7,
          access: { globalRoles: ['owner'], applications: [] },
        },
        'owner-1',
      ),
    ).resolves.toMatchObject({ access: { globalRoles: ['owner'] } });
    await expect(
      service.createInvitation(
        {
          email: 'second@example.com',
          expiresInDays: 7,
          access: {
            globalRoles: [],
            applications: [{ applicationId: 'app-1', roles: ['owner'] }],
          },
        },
        'owner-1',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
    await expect(
      service.createInvitation(
        {
          email: 'third@example.com',
          expiresInDays: 7,
          access: {
            globalRoles: [],
            applications: [{ applicationId: 'missing-app', roles: ['viewer'] }],
          },
        },
        'owner-1',
      ),
    ).rejects.toMatchObject({ code: 'APPLICATION_NOT_FOUND', status: 404 });
    await expect(
      service.createInvitation(
        {
          email: 'fourth@example.com',
          expiresInDays: 7,
          access: { globalRoles: [], applications: [] },
        },
        'owner-1',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
  });

  it('rejects an existing member or another live invitation for the email', async () => {
    await seedUser('member-1', 'Member', 'member@example.com');
    await expect(
      createViewerInvitation('MEMBER@example.com'),
    ).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_EXISTS',
      status: 409,
    });

    await createViewerInvitation('pending@example.com');
    await expect(
      createViewerInvitation('PENDING@example.com'),
    ).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_EXISTS',
      status: 409,
    });
  });

  it('serializes concurrent creation for the same normalized email', async () => {
    const results = await Promise.allSettled([
      createViewerInvitation('race@example.com'),
      createViewerInvitation('RACE@example.com'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({
          code: 'INVITATION_ALREADY_EXISTS',
          status: 409,
        }),
      }),
    ]);
    await expect(
      service.listInvitations({ query: 'race@' }),
    ).resolves.toMatchObject({ total: 1 });
  });
});

describe('HubInvitationService listing and revocation', () => {
  it('filters, stably sorts, paginates, and materializes expired status', async () => {
    const first = await createViewerInvitation('alpha@example.com', 1);
    currentTime = new Date('2026-08-26T08:00:00.001Z');
    const second = await createViewerInvitation('beta@example.com', 7);
    const third = await createViewerInvitation('gamma@example.com', 7);
    await service.revokeInvitation(third.id);

    await expect(
      service.listInvitations({
        status: 'expired',
        sort: 'createdAt',
        limit: 1,
        offset: 0,
      }),
    ).resolves.toMatchObject({
      total: 1,
      limit: 1,
      offset: 0,
      items: [{ id: first.id, status: 'expired' }],
    });
    await expect(
      service.listInvitations({ query: 'BETA', status: 'pending' }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ id: second.id, email: 'beta@example.com' }],
    });
    await expect(
      service.listInvitations({ status: 'revoked' }),
    ).resolves.toMatchObject({ total: 1, items: [{ id: third.id }] });
  });

  it('revokes only pending invitations and makes the same revoke idempotent', async () => {
    const created = await createViewerInvitation('viewer@example.com');
    const revoked = await service.revokeInvitation(created.id);
    expect(revoked).toMatchObject({
      idempotent: false,
      invitation: { id: created.id, status: 'revoked' },
    });
    await expect(service.revokeInvitation(created.id)).resolves.toMatchObject({
      idempotent: true,
      invitation: { status: 'revoked' },
    });

    const accepted = await createViewerInvitation('accepted@example.com');
    await database.connection.query
      .updateTable('hubInvitations')
      .set({ status: 'accepted', acceptedBy: 'member-1' })
      .where('id', '=', accepted.id)
      .execute();
    await expect(service.revokeInvitation(accepted.id)).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_ACCEPTED',
      status: 409,
    });

    const expired = await createViewerInvitation('old@example.com', 1);
    currentTime = new Date('2026-08-26T08:00:00.001Z');
    await expect(service.revokeInvitation(expired.id)).rejects.toMatchObject({
      code: 'INVITATION_EXPIRED',
      status: 410,
    });
    await expect(
      service.listInvitations({ status: 'expired', query: 'old@' }),
    ).resolves.toMatchObject({ total: 1 });
  });
});

describe('HubInvitationService public resolution', () => {
  it('returns only masked identity and role/APP display summaries', async () => {
    const created = await service.createInvitation(
      {
        email: 'developer@example.com',
        expiresInDays: 7,
        access: {
          globalRoles: ['viewer'],
          applications: [
            {
              applicationId: 'app-1',
              roles: ['developer', 'deployer'],
            },
          ],
        },
      },
      'owner-1',
    );
    const token = new URL(created.inviteUrl).hash.slice('#token='.length);

    const resolved = await service.resolveInvitation(token);
    expect(resolved).toEqual({
      email: 'd*******r@example.com',
      hubDisplayName: 'NocoBase Hub',
      access: {
        globalRoles: [{ id: 'viewer', name: 'Viewer' }],
        applications: [
          {
            name: 'Sales CRM',
            roles: [
              { id: 'developer', name: 'Developer' },
              { id: 'deployer', name: 'Deployer' },
            ],
          },
        ],
      },
      expiresAt: '2026-09-01T08:00:00.000Z',
    });
    expect(JSON.stringify(resolved)).not.toContain(token);
    expect(JSON.stringify(resolved)).not.toContain('developer@example.com');
    expect(JSON.stringify(resolved)).not.toContain('app-1');
  });

  it('resolves numeric-string SQLite timestamps without exposing internals', async () => {
    const created = await createViewerInvitation('time@example.com');
    const token = tokenFrom(created.inviteUrl);
    await database.connection.query
      .updateTable('hubInvitations')
      .set({
        expiresAt: String(new Date('2026-09-01T08:00:00.000Z').valueOf()),
      })
      .where('id', '=', created.id)
      .execute();

    await expect(service.resolveInvitation(token)).resolves.toMatchObject({
      email: 't**e@example.com',
      expiresAt: '2026-09-01T08:00:00.000Z',
    });
  });

  it('distinguishes invalid, expired, revoked, and accepted tokens', async () => {
    await expect(
      service.resolveInvitation('nbi_invalid'),
    ).rejects.toMatchObject({ code: 'INVITATION_NOT_FOUND', status: 404 });

    const expired = await createViewerInvitation('expired@example.com', 1);
    const expiredToken = tokenFrom(expired.inviteUrl);
    currentTime = new Date('2026-08-26T08:00:00.001Z');
    await expect(service.resolveInvitation(expiredToken)).rejects.toMatchObject(
      {
        code: 'INVITATION_EXPIRED',
        status: 410,
      },
    );

    const revoked = await createViewerInvitation('revoked@example.com');
    const revokedToken = tokenFrom(revoked.inviteUrl);
    await service.revokeInvitation(revoked.id);
    await expect(service.resolveInvitation(revokedToken)).rejects.toMatchObject(
      {
        code: 'INVITATION_EXPIRED',
        status: 410,
      },
    );

    const accepted = await createViewerInvitation('used@example.com');
    const acceptedToken = tokenFrom(accepted.inviteUrl);
    await database.connection.query
      .updateTable('hubInvitations')
      .set({ status: 'accepted', acceptedBy: 'member-1' })
      .where('id', '=', accepted.id)
      .execute();
    await expect(
      service.resolveInvitation(acceptedToken),
    ).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_ACCEPTED',
      status: 409,
    });
  });
});

describe('HubInvitationService acceptance', () => {
  it('atomically creates a login-capable active member without creating a session', async () => {
    await seedAssignmentRevision('application', 'app-1', 4);
    const created = await service.createInvitation(
      {
        email: 'invited@example.com',
        expiresInDays: 7,
        access: {
          globalRoles: ['viewer'],
          applications: [
            {
              applicationId: 'app-1',
              roles: ['developer', 'deployer'],
            },
          ],
        },
      },
      'owner-1',
    );
    const token = tokenFrom(created.inviteUrl);
    const password = 'correct horse battery staple';

    const accepted = await service.acceptInvitation({
      token,
      name: 'Invited Member',
      username: 'Invited.Member',
      password,
    });

    expect(accepted).toEqual({
      member: {
        id: expect.any(String),
        name: 'Invited Member',
        email: 'invited@example.com',
        username: 'invited.member',
        status: 'active',
        roles: ['viewer', 'developer', 'deployer'],
        applicationIds: ['app-1'],
        lastActiveAt: null,
        createdAt: expect.any(String),
        revision: 1,
      },
      access: {
        globalRoles: ['viewer'],
        applications: [
          {
            applicationId: 'app-1',
            roles: ['developer', 'deployer'],
          },
        ],
      },
    });
    expect(accepted).not.toHaveProperty('token');
    expect(accepted).not.toHaveProperty('password');

    await expect(
      database.connection.query.selectFrom('session').select('id').execute(),
    ).resolves.toEqual([]);
    await expect(
      database.connection.query
        .selectFrom('hubMemberStatuses')
        .select(['status', 'revision'])
        .where('userId', '=', accepted.member.id)
        .executeTakeFirst(),
    ).resolves.toEqual({ status: 'active', revision: 1 });
    await expect(
      database.connection.query
        .selectFrom('hubRoleAssignments')
        .select(['role', 'applicationId'])
        .where('userId', '=', accepted.member.id)
        .orderBy('createdAt', 'asc')
        .execute(),
    ).resolves.toEqual([
      { role: 'viewer', applicationId: null },
      { role: 'developer', applicationId: 'app-1' },
      { role: 'deployer', applicationId: 'app-1' },
    ]);
    await expect(
      database.connection.query
        .selectFrom('hubAssignmentRevisions')
        .select(['scopeType', 'scopeId', 'revision'])
        .where((expression) =>
          expression.or([
            expression('scopeId', '=', accepted.member.id),
            expression('scopeId', '=', 'app-1'),
          ]),
        )
        .orderBy('scopeType', 'asc')
        .execute(),
    ).resolves.toEqual([
      { scopeType: 'application', scopeId: 'app-1', revision: 5 },
      { scopeType: 'member', scopeId: accepted.member.id, revision: 1 },
    ]);
    await expect(
      database.connection.query
        .selectFrom('hubInvitations')
        .select(['status', 'acceptedBy', 'acceptedAt'])
        .where('id', '=', created.id)
        .executeTakeFirst(),
    ).resolves.toMatchObject({
      status: 'accepted',
      acceptedBy: accepted.member.id,
      acceptedAt: expect.anything(),
    });

    const audit = await database.connection.query
      .selectFrom('hubAuditLogs')
      .selectAll()
      .where('resourceId', '=', accepted.member.id)
      .executeTakeFirst();
    expect(audit).toMatchObject({
      actorId: accepted.member.id,
      action: 'member.updated',
      resource: 'member',
      result: 'success',
      source: 'web',
    });
    expect(JSON.parse(String(audit?.details))).toEqual({
      change: 'invitationAccepted',
      invitationId: created.id,
      globalRoles: ['viewer'],
      applicationIds: ['app-1'],
    });
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain(password);
    expect(JSON.stringify(audit)).not.toContain('tokenHash');

    const persisted = await Promise.all([
      database.connection.query.selectFrom('user').selectAll().execute(),
      database.connection.query.selectFrom('account').selectAll().execute(),
      database.connection.query
        .selectFrom('hubInvitations')
        .selectAll()
        .execute(),
      database.connection.query
        .selectFrom('hubAuditLogs')
        .selectAll()
        .execute(),
    ]);
    expect(JSON.stringify(persisted)).not.toContain(token);
    expect(JSON.stringify(persisted)).not.toContain(password);

    const app = new Hono();
    app.on(['GET', 'POST'], '/hub/api/auth/*', (context) =>
      auth.handler(context.req.raw),
    );
    const login = await app.request('/hub/api/auth/sign-in/username', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'INVITED.MEMBER', password }),
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({
      user: { id: accepted.member.id, email: 'invited@example.com' },
    });
  });

  it('allows the token to succeed only once under concurrent acceptance', async () => {
    const created = await createViewerInvitation('race-accept@example.com');
    const input = {
      token: tokenFrom(created.inviteUrl),
      name: 'Race Member',
      username: 'race.member',
      password: 'correct horse battery staple',
    };

    const results = await Promise.allSettled([
      service.acceptInvitation(input),
      createInvitationService().acceptInvitation(input),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({
          code: 'INVITATION_ALREADY_ACCEPTED',
          status: 409,
        }),
      }),
    ]);
    await expect(
      database.connection.query
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'race-accept@example.com')
        .execute(),
    ).resolves.toHaveLength(1);
  });

  it('rejects expired, revoked, and accepted invitations before creating an account', async () => {
    const expired = await createViewerInvitation(
      'accept-expired@example.com',
      1,
    );
    currentTime = new Date('2026-08-26T08:00:00.001Z');
    await expect(
      accept(tokenFrom(expired.inviteUrl), 'expired'),
    ).rejects.toMatchObject({ code: 'INVITATION_EXPIRED', status: 410 });

    const revoked = await createViewerInvitation('accept-revoked@example.com');
    await service.revokeInvitation(revoked.id);
    await expect(
      accept(tokenFrom(revoked.inviteUrl), 'revoked'),
    ).rejects.toMatchObject({ code: 'INVITATION_EXPIRED', status: 410 });

    const accepted = await createViewerInvitation('accept-used@example.com');
    await accept(tokenFrom(accepted.inviteUrl), 'accepted');
    await expect(
      accept(tokenFrom(accepted.inviteUrl), 'accepted.two'),
    ).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_ACCEPTED',
      status: 409,
    });
  });

  it('rolls back reservation and every user write for duplicate email or username', async () => {
    const duplicateEmail = await createViewerInvitation('member@example.com');
    await auth.createPasswordUser(
      {
        email: 'member@example.com',
        name: 'Existing Member',
        username: 'existing.member',
        password: 'correct horse battery staple',
      },
      { connection: database.connection },
    );

    await expect(
      accept(tokenFrom(duplicateEmail.inviteUrl), 'duplicate.email'),
    ).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_EXISTS',
      status: 409,
    });

    const duplicateUsername = await createViewerInvitation(
      'different@example.com',
    );
    await expect(
      service.acceptInvitation({
        token: tokenFrom(duplicateUsername.inviteUrl),
        name: 'Different Member',
        username: 'EXISTING.MEMBER',
        password: 'correct horse battery staple',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      issues: [expect.objectContaining({ path: 'username' })],
    });

    await expect(
      database.connection.query
        .selectFrom('hubInvitations')
        .select(['id', 'status'])
        .where('id', 'in', [duplicateEmail.id, duplicateUsername.id])
        .orderBy('id', 'asc')
        .execute(),
    ).resolves.toEqual(
      [duplicateEmail.id, duplicateUsername.id]
        .sort()
        .map((id) => ({ id, status: 'pending' })),
    );
    await expect(
      database.connection.query.selectFrom('user').select('id').execute(),
    ).resolves.toHaveLength(2);
  });

  it('rolls back a user created by Auth when a later injected failure occurs', async () => {
    const created = await createViewerInvitation('rollback@example.com');
    const failingAuth: Pick<Auth, 'createPasswordUser'> = {
      async createPasswordUser(input, options): Promise<PasswordUser> {
        const user = await auth.createPasswordUser(input, options);
        throw Object.assign(new Error('injected after user creation'), {
          createdUserId: user.id,
        });
      },
    };
    const failingService = createInvitationService(failingAuth);

    await expect(
      failingService.acceptInvitation({
        token: tokenFrom(created.inviteUrl),
        name: 'Rollback Member',
        username: 'rollback.member',
        password: 'correct horse battery staple',
      }),
    ).rejects.toMatchObject({
      code: 'INVITATION_ACCEPTANCE_FAILED',
      status: 500,
    });
    await expect(
      database.connection.query
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'rollback@example.com')
        .execute(),
    ).resolves.toEqual([]);
    await expect(
      database.connection.query
        .selectFrom('account')
        .select('id')
        .where('accountId', '=', 'rollback@example.com')
        .execute(),
    ).resolves.toEqual([]);
    await expect(
      database.connection.query
        .selectFrom('hubInvitations')
        .select('status')
        .where('id', '=', created.id)
        .executeTakeFirst(),
    ).resolves.toEqual({ status: 'pending' });
    await expect(
      database.connection.query
        .selectFrom('hubAuditLogs')
        .select('id')
        .where('resourceId', '=', created.id)
        .execute(),
    ).resolves.toEqual([]);
  });

  it('rolls back every acceptance write when the final audit insert fails', async () => {
    await seedAssignmentRevision('application', 'app-1', 4);
    const created = await service.createInvitation(
      {
        email: 'audit-rollback@example.com',
        expiresInDays: 7,
        access: {
          globalRoles: ['viewer'],
          applications: [{ applicationId: 'app-1', roles: ['developer'] }],
        },
      },
      'owner-1',
    );
    const knex = await database.connection.client<Knex>();
    const tables = await knex('sqlite_master')
      .select<{ name: string }[]>('name')
      .where('type', '=', 'table');
    const auditTable = tables.find(
      ({ name }) => name.replaceAll('_', '').toLowerCase() === 'hubauditlogs',
    )?.name;
    expect(auditTable).toBeTruthy();
    await knex.raw(`
      CREATE TRIGGER reject_invitation_acceptance_audit
      BEFORE INSERT ON "${auditTable?.replaceAll('"', '""')}"
      BEGIN
        SELECT RAISE(ABORT, 'simulated acceptance audit failure');
      END
    `);

    await expect(
      service.acceptInvitation({
        token: tokenFrom(created.inviteUrl),
        name: 'Audit Rollback Member',
        username: 'audit.rollback',
        password: 'correct horse battery staple',
      }),
    ).rejects.toMatchObject({
      code: 'INVITATION_ACCEPTANCE_FAILED',
      status: 500,
    });
    await expect(
      database.connection.query
        .selectFrom('user')
        .select('id')
        .where('email', '=', 'audit-rollback@example.com')
        .execute(),
    ).resolves.toEqual([]);
    await expect(
      database.connection.query
        .selectFrom('hubInvitations')
        .select(['status', 'acceptedBy'])
        .where('id', '=', created.id)
        .executeTakeFirst(),
    ).resolves.toEqual({ status: 'pending', acceptedBy: null });
    await expect(
      database.connection.query
        .selectFrom('hubRoleAssignments')
        .select('role')
        .where('userId', '!=', 'owner-1')
        .execute(),
    ).resolves.toEqual([]);
    await expect(
      database.connection.query
        .selectFrom('hubAssignmentRevisions')
        .select('revision')
        .where('scopeType', '=', 'application')
        .where('scopeId', '=', 'app-1')
        .executeTakeFirst(),
    ).resolves.toEqual({ revision: 4 });
  });

  it('maps stable authentication creation errors without inspecting messages', async () => {
    const emailConflict = await createViewerInvitation(
      'auth-email-conflict@example.com',
    );
    const invalidPassword = await createViewerInvitation(
      'auth-password-invalid@example.com',
    );
    const emailConflictService = createInvitationService({
      async createPasswordUser(): Promise<PasswordUser> {
        throw new PasswordUserCreationError(
          'EMAIL_ALREADY_EXISTS',
          'Localized or provider-specific message.',
        );
      },
    });
    const invalidPasswordService = createInvitationService({
      async createPasswordUser(): Promise<PasswordUser> {
        throw new PasswordUserCreationError(
          'INVALID_PASSWORD',
          'Localized or provider-specific message.',
        );
      },
    });

    await expect(
      emailConflictService.acceptInvitation({
        token: tokenFrom(emailConflict.inviteUrl),
        name: 'Email Conflict',
        username: 'email.conflict',
        password: 'correct horse battery staple',
      }),
    ).rejects.toMatchObject({
      code: 'INVITATION_ALREADY_EXISTS',
      status: 409,
    });
    await expect(
      invalidPasswordService.acceptInvitation({
        token: tokenFrom(invalidPassword.inviteUrl),
        name: 'Invalid Password',
        username: 'invalid.password',
        password: 'correct horse battery staple',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 422,
      issues: [expect.objectContaining({ path: 'password' })],
    });
  });
});

async function createViewerInvitation(email: string, expiresInDays = 7) {
  return service.createInvitation(
    {
      email,
      expiresInDays,
      access: { globalRoles: ['viewer'], applications: [] },
    },
    'owner-1',
  );
}

function tokenFrom(inviteUrl: string): string {
  return new URL(inviteUrl).hash.slice('#token='.length);
}

function createInvitationService(
  authOverride: Pick<Auth, 'createPasswordUser'> = auth,
): HubInvitationService {
  return new HubInvitationService(database.connection, {
    acceptanceUrl: 'https://hub.example.com/hub/invitation-acceptance',
    hubDisplayName: 'NocoBase Hub',
    roles,
    auth: authOverride,
    clock: () => new Date(currentTime),
  });
}

async function accept(token: string, suffix: string) {
  return service.acceptInvitation({
    token,
    name: `Member ${suffix}`,
    username: `member.${suffix}`,
    password: 'correct horse battery staple',
  });
}

async function seedUser(
  id: string,
  name: string,
  email: string,
): Promise<void> {
  await database.connection.query
    .insertInto('user')
    .values({
      id,
      name,
      username: id,
      email,
      emailVerified: false,
      image: null,
      createdAt: currentTime,
      updatedAt: currentTime,
    })
    .execute();
}

async function seedApplication(id: string, name: string): Promise<void> {
  await database.connection.query
    .insertInto('hubApplications')
    .values({
      id,
      slug: id,
      name,
      description: null,
      status: 'active',
      isDefault: false,
      revision: 1,
      defaultEnvironmentId: 'default',
      activeReleaseId: null,
      createdBy: 'owner-1',
      createdAt: currentTime,
      updatedAt: currentTime,
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
    .values({ scopeType, scopeId, revision, updatedAt: currentTime })
    .execute();
}
