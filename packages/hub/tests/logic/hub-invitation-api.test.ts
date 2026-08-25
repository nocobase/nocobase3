// @vitest-environment node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp, type HubApp } from '../../server/index.ts';

const execFileAsync = promisify(execFile);
const browserOrigin = 'http://127.0.0.1:13221';
const authSecret = 'hub-invitation-test-secret-at-least-32-characters';

describe('Hub invitation API', () => {
  let temporaryRoot: string;
  let app: HubApp;
  let ownerCookie: string;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), 'hub-invitation-api-'));
    const seedPath = await createRepositorySeed(temporaryRoot);
    app = createApp({
      appName: 'hub',
      basePath: '/hub',
      browserBasePath: '/hub',
      hub: true,
      databasePath: path.join(temporaryRoot, 'hub.sqlite'),
      authSecret,
      authBaseUrl: `${browserOrigin}/hub/api/auth`,
      sourceRoot: path.join(temporaryRoot, 'sources'),
      repositorySeedPath: seedPath,
      releaseRoot: path.join(temporaryRoot, 'releases'),
      runtimeSecretEncryptionKey: Buffer.alloc(32, 9).toString('base64'),
    });
    await app.hubReady;
    ownerCookie = await setupOwnerAndSignIn(app);
  });

  afterEach(async () => {
    await app.close?.();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('creates, resolves and atomically accepts an application-scoped invitation', async () => {
    const applicationResponse = await ownerRequest('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-invitation-app' },
      body: JSON.stringify({ slug: 'invited-app', name: 'Invited APP' }),
    });
    expect(applicationResponse.status).toBe(201);
    const application = (await applicationResponse.json()).data as {
      id: string;
    };
    const hiddenApplicationResponse = await ownerRequest('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-hidden-app' },
      body: JSON.stringify({ slug: 'hidden-app', name: 'Hidden APP' }),
    });
    expect(hiddenApplicationResponse.status).toBe(201);
    const hiddenApplication = (await hiddenApplicationResponse.json()).data as {
      id: string;
    };

    const createBody = {
      email: 'INVITED@EXAMPLE.COM',
      expiresInDays: 7,
      access: {
        globalRoles: [],
        applications: [{ applicationId: application.id, roles: ['developer'] }],
      },
    };
    const createdResponse = await ownerRequest('/invitations', {
      method: 'POST',
      headers: { 'idempotency-key': 'invite-developer' },
      body: JSON.stringify(createBody),
    });
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()).data as {
      id: string;
      inviteUrl: string;
    };
    expect(created.inviteUrl).toMatch(/#token=nbi_[A-Za-z0-9_-]{43}$/);
    const token = new URL(created.inviteUrl).hash.slice('#token='.length);

    const replay = await ownerRequest('/invitations', {
      method: 'POST',
      headers: { 'idempotency-key': 'invite-developer' },
      body: JSON.stringify(createBody),
    });
    expect(replay.status).toBe(200);
    const replayText = await replay.text();
    expect(JSON.parse(replayText)).toMatchObject({
      data: { id: created.id, email: 'invited@example.com' },
      meta: { idempotent: true },
    });
    expect(replayText).not.toContain(token);

    const listed = await ownerRequest(
      '/invitations?status=pending&sort=-createdAt&limit=20&offset=0',
    );
    expect(listed.status).toBe(200);
    const listedPayload = await listed.json();
    expect(listedPayload).toMatchObject({
      data: [{ id: created.id, status: 'pending' }],
      meta: { total: 1, limit: 20, offset: 0 },
    });
    expect(JSON.stringify(listedPayload)).not.toContain(token);
    expect(JSON.stringify(listedPayload)).not.toContain('inviteUrl');

    const resolved = await publicRequest('/invitation-acceptance/resolve', {
      token,
    });
    expect(resolved.status).toBe(200);
    await expect(resolved.json()).resolves.toMatchObject({
      data: {
        email: 'i*****d@example.com',
        hubDisplayName: 'hub',
        access: {
          applications: [
            {
              name: 'Invited APP',
              roles: [{ id: 'developer' }],
            },
          ],
        },
      },
    });

    const accepted = await publicRequest('/invitation-acceptance/accept', {
      token,
      name: 'Invited Member',
      username: 'Invited.Member',
      password: 'correct horse battery staple',
    });
    expect(accepted.status).toBe(201);
    expect(accepted.headers.get('set-cookie')).toBeNull();
    const acceptedPayload = await accepted.json();
    expect(acceptedPayload).toMatchObject({
      data: {
        name: 'Invited Member',
        email: 'invited@example.com',
        username: 'invited.member',
        status: 'active',
        roles: ['developer'],
        applicationIds: [application.id],
      },
    });

    const repeatedAccept = await publicRequest(
      '/invitation-acceptance/accept',
      {
        token,
        name: 'Invited Member',
        username: 'Invited.Member',
        password: 'correct horse battery staple',
      },
    );
    expect(repeatedAccept.status).toBe(409);
    await expect(repeatedAccept.json()).resolves.toMatchObject({
      error: { code: 'INVITATION_ALREADY_ACCEPTED' },
    });

    const signIn = await publicRequest('/auth/sign-in/username', {
      username: 'INVITED.MEMBER',
      password: 'correct horse battery staple',
    });
    expect(signIn.status).toBe(200);
    const invitedCookie = signIn.headers.get('set-cookie') ?? '';
    expect(invitedCookie).toContain('hub.session_token');

    const device = await publicRequest('/agent-auth/device', {
      clientId: 'nb-cli',
      clientName: 'Invited Developer Agent',
      scopes: [
        'profile',
        'apps:read',
        'source:read',
        'source:write',
        'releases:read',
        'releases:publish',
      ],
      applicationScope: {
        mode: 'selected',
        applicationIds: [application.id],
      },
    });
    const deviceGrant = (await device.json()).data;
    const resolvedAgent = await browserRequest(
      '/agent-authorizations/resolve',
      invitedCookie,
      {
        method: 'POST',
        body: JSON.stringify({ userCode: deviceGrant.userCode }),
      },
    );
    const agentAuthorization = (await resolvedAgent.json()).data;
    const approvedAgent = await browserRequest(
      `/agent-authorizations/${agentAuthorization.id}/approve`,
      invitedCookie,
      {
        method: 'POST',
        body: JSON.stringify({
          scopes: [
            'profile',
            'apps:read',
            'source:read',
            'source:write',
            'releases:read',
            'releases:publish',
          ],
          applicationScope: {
            mode: 'selected',
            applicationIds: [application.id],
          },
        }),
      },
    );
    expect(approvedAgent.status).toBe(200);

    const visibleApplication = await browserRequest(
      `/apps/${application.id}`,
      invitedCookie,
    );
    expect(visibleApplication.status).toBe(200);
    const applicationPage = await browserRequest(
      '/apps?limit=20&offset=0',
      invitedCookie,
    );
    expect(applicationPage.status).toBe(200);
    await expect(applicationPage.json()).resolves.toMatchObject({
      data: [{ id: application.id }],
      meta: { total: 1, limit: 20, offset: 0 },
    });
    const hiddenApplicationDetail = await browserRequest(
      `/apps/${hiddenApplication.id}`,
      invitedCookie,
    );
    expect(hiddenApplicationDetail.status).toBe(404);
    const deploymentPage = await browserRequest(
      '/deployments?limit=20&offset=0',
      invitedCookie,
    );
    expect(deploymentPage.status).toBe(200);
    await expect(deploymentPage.json()).resolves.toMatchObject({
      data: [],
      meta: { total: 0, limit: 20, offset: 0 },
    });
    const scopedAuditPage = await browserRequest(
      '/audit-logs?limit=100&offset=0',
      invitedCookie,
    );
    expect(scopedAuditPage.status).toBe(200);
    const scopedAudits = await scopedAuditPage.json();
    expect(scopedAudits.data.length).toBeGreaterThan(0);
    expect(
      scopedAudits.data.every(
        (log: { application?: { id?: string } | null }) =>
          log.application?.id === application.id,
      ),
    ).toBe(true);
    const hiddenApplicationAudit = await browserRequest(
      `/audit-logs?applicationId=${encodeURIComponent(hiddenApplication.id)}`,
      invitedCookie,
    );
    expect(hiddenApplicationAudit.status).toBe(404);
    await expect(hiddenApplicationAudit.json()).resolves.toMatchObject({
      error: { code: 'APPLICATION_NOT_FOUND' },
    });
    const members = await browserRequest('/members', invitedCookie);
    expect(members.status).toBe(403);

    const applicationAccess = await ownerRequest(
      `/apps/${application.id}/access`,
    );
    expect(applicationAccess.status).toBe(200);
    await expect(applicationAccess.json()).resolves.toMatchObject({
      data: [
        {
          memberId: acceptedPayload.data.id,
          name: 'Invited Member',
          email: 'invited@example.com',
          username: 'invited.member',
          status: 'active',
          roles: ['developer'],
        },
      ],
      meta: { total: 1 },
    });

    const memberDetail = await ownerRequest(
      `/members/${acceptedPayload.data.id}`,
    );
    expect(memberDetail.status).toBe(200);
    expect(memberDetail.headers.get('etag')).toBe('"rev-1"');
    const disabled = await ownerRequest(`/members/${acceptedPayload.data.id}`, {
      method: 'PATCH',
      headers: { 'if-match': '"rev-1"' },
      body: JSON.stringify({ status: 'disabled' }),
    });
    expect(disabled.status).toBe(200);
    expect(disabled.headers.get('etag')).toBe('"rev-2"');
    const disabledSession = await browserRequest(
      `/apps/${application.id}`,
      invitedCookie,
    );
    expect(disabledSession.status).toBe(401);
    await expect(disabledSession.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    });

    const audits = await ownerRequest('/audit-logs?sort=-createdAt');
    expect(audits.status).toBe(200);
    const auditText = await audits.text();
    expect(auditText).toContain('member.updated');
    expect(auditText).toContain('invitationAccepted');
    expect(auditText).not.toContain(token);
    expect(auditText).not.toContain('correct horse battery staple');
  });

  it('requires member capabilities, supports revocation and rate-limits public resolution', async () => {
    const unauthorized = await publicRequest('/invitations', {
      email: 'blocked@example.com',
      expiresInDays: 7,
      access: { globalRoles: ['viewer'], applications: [] },
    });
    expect(unauthorized.status).toBe(401);

    const create = await ownerRequest('/invitations', {
      method: 'POST',
      headers: { 'idempotency-key': 'invite-revoked' },
      body: JSON.stringify({
        email: 'revoked@example.com',
        expiresInDays: 7,
        access: { globalRoles: ['viewer'], applications: [] },
      }),
    });
    const invitation = (await create.json()).data as {
      id: string;
      inviteUrl: string;
    };
    const token = new URL(invitation.inviteUrl).hash.slice('#token='.length);

    const revoked = await ownerRequest(`/invitations/${invitation.id}`, {
      method: 'DELETE',
    });
    expect(revoked.status).toBe(200);
    await expect(revoked.json()).resolves.toMatchObject({
      data: { status: 'revoked' },
      meta: { idempotent: false },
    });
    const resolveRevoked = await publicRequest(
      '/invitation-acceptance/resolve',
      { token },
    );
    expect(resolveRevoked.status).toBe(410);

    let limited: Response | undefined;
    for (let index = 0; index < 20; index += 1) {
      const response = await publicRequest('/invitation-acceptance/resolve', {
        token: `nbi_${String(index).padStart(43, '0')}`,
      });
      if (response.status === 429) {
        limited = response;
        break;
      }
    }
    expect(limited?.status).toBe(429);
    expect(Number(limited?.headers.get('retry-after'))).toBeGreaterThan(0);
    await expect(limited?.json()).resolves.toMatchObject({
      error: { code: 'RATE_LIMITED', retryable: true },
    });
  });

  it('does not let an Administrator create or transfer Owner access', async () => {
    const createAdmin = await ownerRequest('/invitations', {
      method: 'POST',
      headers: { 'idempotency-key': 'invite-admin' },
      body: JSON.stringify({
        email: 'admin@example.com',
        expiresInDays: 7,
        access: { globalRoles: ['admin'], applications: [] },
      }),
    });
    expect(createAdmin.status).toBe(201);
    const invitation = (await createAdmin.json()).data as {
      inviteUrl: string;
    };
    const token = new URL(invitation.inviteUrl).hash.slice('#token='.length);
    const accepted = await publicRequest('/invitation-acceptance/accept', {
      token,
      name: 'Hub Administrator',
      username: 'hub.admin',
      password: 'correct horse battery staple',
    });
    expect(accepted.status).toBe(201);
    const administrator = (await accepted.json()).data as { id: string };
    const signIn = await publicRequest('/auth/sign-in/username', {
      username: 'hub.admin',
      password: 'correct horse battery staple',
    });
    expect(signIn.status).toBe(200);
    const adminCookie = signIn.headers.get('set-cookie') ?? '';

    const ownerInvitation = await browserRequest('/invitations', adminCookie, {
      method: 'POST',
      headers: { 'idempotency-key': 'admin-invite-owner' },
      body: JSON.stringify({
        email: 'second-owner@example.com',
        expiresInDays: 7,
        access: { globalRoles: ['owner'], applications: [] },
      }),
    });
    expect(ownerInvitation.status).toBe(403);
    await expect(ownerInvitation.json()).resolves.toMatchObject({
      error: { code: 'OWNER_ASSIGNMENT_FORBIDDEN' },
    });

    const currentAccess = await browserRequest(
      `/members/${administrator.id}/access`,
      adminCookie,
    );
    expect(currentAccess.status).toBe(200);
    const ownerTransfer = await browserRequest(
      `/members/${administrator.id}/access`,
      adminCookie,
      {
        method: 'PUT',
        headers: {
          'if-match': currentAccess.headers.get('etag') ?? '"rev-1"',
        },
        body: JSON.stringify({
          globalRoles: ['owner'],
          applications: [],
        }),
      },
    );
    expect(ownerTransfer.status).toBe(403);
    await expect(ownerTransfer.json()).resolves.toMatchObject({
      error: { code: 'OWNER_ASSIGNMENT_FORBIDDEN' },
    });
  });

  function ownerRequest(
    pathname: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return browserRequest(pathname, ownerCookie, init);
  }

  function browserRequest(
    pathname: string,
    cookie: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('cookie', cookie);
    if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
      headers.set('origin', browserOrigin);
      if (init.method !== 'DELETE' && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }
    return app.request(`${browserOrigin}/hub/api${pathname}`, {
      ...init,
      headers,
    });
  }

  function publicRequest(
    pathname: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return app.request(`${browserOrigin}/hub/api${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: browserOrigin,
      },
      body: JSON.stringify(body),
    });
  }
});

async function setupOwnerAndSignIn(app: HubApp): Promise<string> {
  const owner = await app.request(`${browserOrigin}/hub/api/setup/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: browserOrigin },
    body: JSON.stringify({
      email: 'owner@example.com',
      password: 'correct horse battery staple',
      name: 'Hub Owner',
      username: 'owner',
    }),
  });
  expect(owner.status).toBe(201);

  const signIn = await app.request(
    `${browserOrigin}/hub/api/auth/sign-in/email`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: browserOrigin },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      }),
    },
  );
  expect(signIn.status).toBe(200);
  return signIn.headers.get('set-cookie') ?? '';
}

async function createRepositorySeed(root: string): Promise<string> {
  const worktree = path.join(root, 'seed-worktree');
  const bare = path.join(root, 'default-template.git');
  await mkdir(worktree, { recursive: true });
  await execFileAsync('git', ['init', '--initial-branch=main'], {
    cwd: worktree,
  });
  await writeFile(path.join(worktree, 'README.md'), '# Default APP\n');
  await execFileAsync('git', ['add', 'README.md'], { cwd: worktree });
  await execFileAsync('git', ['commit', '-m', 'Initial template'], {
    cwd: worktree,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'NocoBase',
      GIT_AUTHOR_EMAIL: 'support@nocobase.com',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
      GIT_COMMITTER_NAME: 'NocoBase',
      GIT_COMMITTER_EMAIL: 'support@nocobase.com',
      GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    },
  });
  await execFileAsync('git', ['clone', '--bare', '--', worktree, bare]);
  return bare;
}
