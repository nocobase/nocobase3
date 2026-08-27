// @vitest-environment node

import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp, type HubApp } from '../../server/index.ts';
import { createHubDatabase } from '../../server/hub/database.ts';
import { HubStore } from '../../server/hub/store.ts';

const origin = 'http://127.0.0.1:13221';
const authSecret = 'hub-agent-api-test-secret-at-least-32-characters';

describe('Hub Agent authorization API', () => {
  let root: string;
  let app: HubApp;
  let cookie: string;
  let applicationId: string;
  let databasePath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hub-agent-api-'));
    databasePath = path.join(root, 'hub.sqlite');
    app = createApp({
      appName: 'hub',
      basePath: '/hub',
      browserBasePath: '/hub',
      hub: true,
      databasePath,
      authSecret,
      authBaseUrl: `${origin}/hub/api/auth`,
      releaseRoot: path.join(root, 'releases'),
      runtimeSecretEncryptionKey: Buffer.alloc(32, 8).toString('base64'),
    });
    await app.hubReady;
    cookie = await setupOwnerAndSignIn(app);
    const created = await browserRequest('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-agent-app' },
      body: JSON.stringify({ slug: 'agent-app', name: 'Agent APP' }),
    });
    applicationId = (await created.json()).data.id as string;
  });

  afterEach(async () => {
    await app.close?.();
    await rm(root, { recursive: true, force: true });
  });

  it('authorizes a device and uses the opaque Bearer credential for scoped APIs', async () => {
    const otherCreated = await browserRequest('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-other-agent-app' },
      body: JSON.stringify({ slug: 'other-app', name: 'Other APP' }),
    });
    const otherApplicationId = (await otherCreated.json()).data.id as string;
    const device = await publicRequest('/agent-auth/device', {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'nb-cli',
        clientName: 'Codex on Mac',
        scopes: ['profile', 'apps:read'],
        applicationScope: { mode: 'selected', applicationIds: [applicationId] },
      }),
    });
    expect(device.status).toBe(201);
    const grant = (await device.json()).data;
    expect(grant).toMatchObject({
      deviceCode: expect.stringMatching(/^nbd_/),
      userCode: expect.stringMatching(/^NB3-/),
      verificationUri: `${origin}/hub/agent-authorize`,
    });

    const resolved = await browserRequest('/agent-authorizations/resolve', {
      method: 'POST',
      body: JSON.stringify({ userCode: grant.userCode }),
    });
    expect(resolved.status).toBe(200);
    const authorization = (await resolved.json()).data;
    expect(JSON.stringify(authorization)).not.toContain(grant.deviceCode);

    const approved = await browserRequest(
      `/agent-authorizations/${authorization.id}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          scopes: ['profile', 'apps:read'],
          applicationScope: {
            mode: 'selected',
            applicationIds: [applicationId],
          },
        }),
      },
    );
    expect(approved.status).toBe(200);

    const token = await publicRequest('/agent-auth/token', {
      method: 'POST',
      body: JSON.stringify({
        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        clientId: 'nb-cli',
        deviceCode: grant.deviceCode,
      }),
    });
    expect(token.status).toBe(200);
    expect(token.headers.get('cache-control')).toBe('no-store');
    expect(token.headers.get('pragma')).toBe('no-cache');
    const tokens = (await token.json()).data;

    const me = await agentRequest('/me', tokens.accessToken);
    expect(me.status).toBe(200);
    const mePayload = await me.json();
    expect(mePayload).toMatchObject({
      data: {
        user: { email: 'owner@example.com' },
        credential: {
          id: tokens.credentialId,
          name: 'Codex on Mac',
          scopes: ['profile', 'apps:read'],
        },
        capabilities: {
          global: [],
          application: [
            {
              applicationId,
              capabilities: [{ resource: 'hub.app', actions: ['read'] }],
            },
          ],
        },
      },
    });
    expect(JSON.stringify(mePayload.data.capabilities)).not.toContain(
      otherApplicationId,
    );

    const apps = await agentRequest('/apps', tokens.accessToken);
    expect(apps.status).toBe(200);
    await expect(apps.json()).resolves.toMatchObject({
      data: [{ id: applicationId }],
      meta: { total: 1 },
    });

    const appDetail = await agentRequest(
      `/apps/${applicationId}`,
      tokens.accessToken,
    );
    expect(appDetail.status).toBe(200);
    const appPayload = await appDetail.json();
    expect(appPayload.data).not.toHaveProperty('repository');
    expect(appPayload.data).not.toHaveProperty('latestRelease');
    expect(appPayload.data).not.toHaveProperty('activeRelease');
    expect(appPayload.data).not.toHaveProperty('runtime');
    expect(appPayload.data).not.toHaveProperty('runtimeSecret');
    expect(
      (await agentRequest(`/apps/${otherApplicationId}`, tokens.accessToken))
        .status,
    ).toBe(403);
    const forbidden = await agentRequest(
      `/apps/${applicationId}/runtime`,
      tokens.accessToken,
    );
    expect(forbidden.status).toBe(403);
    await expect(forbidden.json()).resolves.toMatchObject({
      error: { code: 'INSUFFICIENT_SCOPE' },
    });
  });

  it('lists and revokes only the current browser users credentials', async () => {
    const tokens = await authorize(['profile'], { mode: 'all-authorized' });
    const list = await browserRequest('/agent-credentials?status=active');
    await expect(list.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({ id: tokens.credentialId, status: 'active' }),
      ],
      meta: { total: 1 },
    });

    const revoked = await browserRequest(
      `/agent-credentials/${tokens.credentialId}`,
      { method: 'DELETE' },
    );
    expect(revoked.status).toBe(200);
    const rejected = await agentRequest('/me', tokens.accessToken);
    expect(rejected.status).toBe(401);
  });

  it('isolates release uploads by Agent credential while allowing browser admin observation', async () => {
    const first = await authorize(
      ['releases:publish'],
      { mode: 'selected', applicationIds: [applicationId] },
      'Codex A',
    );
    const second = await authorize(
      ['releases:publish'],
      { mode: 'selected', applicationIds: [applicationId] },
      'Codex B',
    );
    const content = Buffer.from('x');
    const requestBody = JSON.stringify({
      version: '1.0.0',
      checksum: `sha256:${'b'.repeat(64)}`,
      sizeBytes: 1,
      archiveChecksum: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      archiveSizeBytes: content.byteLength,
      archiveFormat: 'tar.gz',
      manifest: {
        schemaVersion: 1,
        basePath: '/agent-app',
        client: { rootDir: 'dist/client' },
        server: {
          entrypoint: 'dist/server/embedded.js',
          healthPath: '/api/healthz',
        },
      },
    });
    const created = await agentRequest(
      `/apps/${applicationId}/release-uploads`,
      first.accessToken,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'shared-upload-key',
        },
        body: requestBody,
      },
    );
    expect(created.status).toBe(201);
    const uploadId = (await created.json()).data.id as string;

    const secondCreated = await agentRequest(
      `/apps/${applicationId}/release-uploads`,
      second.accessToken,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'shared-upload-key',
        },
        body: requestBody,
      },
    );
    expect(secondCreated.status).toBe(201);
    expect((await secondCreated.json()).data.id).not.toBe(uploadId);

    expect(
      (await agentRequest(`/release-uploads/${uploadId}`, second.accessToken))
        .status,
    ).toBe(404);
    expect((await browserRequest(`/release-uploads/${uploadId}`)).status).toBe(
      200,
    );
    expect(
      (
        await browserRequest(`/release-uploads/${uploadId}/content`, {
          method: 'PUT',
          headers: {
            'content-length': String(content.byteLength),
            'content-type': 'application/gzip',
          },
          body: content,
        })
      ).status,
    ).toBe(404);
  });

  it('conceals deployment details outside the Agent application scope', async () => {
    const otherCreated = await browserRequest('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-deployment-scope-app' },
      body: JSON.stringify({
        slug: 'deployment-scope',
        name: 'Deployment Scope',
      }),
    });
    const otherApplicationId = (await otherCreated.json()).data.id as string;
    const database = createHubDatabase({ filename: databasePath });
    await database.ready;
    const store = new HubStore(database.connection);
    const release = await store.createRelease(
      applicationId,
      { version: '1.0.0', checksum: 'sha256:test', manifest: {} },
      'owner',
    );
    const deployment = await store.createDeployment(
      applicationId,
      { targetReleaseId: release.release.id, idempotencyKey: 'scope-test' },
      'owner',
    );
    await database.close();

    const tokens = await authorize(['deployments:read'], {
      mode: 'selected',
      applicationIds: [otherApplicationId],
    });
    expect(
      (
        await agentRequest(
          `/deployments?applicationId=${encodeURIComponent(applicationId)}`,
          tokens.accessToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await agentRequest(
          `/deployments/${deployment.deployment.id}`,
          tokens.accessToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await agentRequest(
          `/deployments/${deployment.deployment.id}/events`,
          tokens.accessToken,
        )
      ).status,
    ).toBe(404);
  });

  async function authorize(
    scopes: string[],
    applicationScope: Record<string, unknown>,
    clientName: string = 'Codex',
  ): Promise<Record<string, string>> {
    const device = await publicRequest('/agent-auth/device', {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'nb-cli',
        clientName,
        scopes,
        applicationScope,
      }),
    });
    const grant = (await device.json()).data;
    const resolve = await browserRequest('/agent-authorizations/resolve', {
      method: 'POST',
      body: JSON.stringify({ userCode: grant.userCode }),
    });
    const authorization = (await resolve.json()).data;
    await browserRequest(`/agent-authorizations/${authorization.id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ scopes, applicationScope }),
    });
    const token = await publicRequest('/agent-auth/token', {
      method: 'POST',
      body: JSON.stringify({
        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
        clientId: 'nb-cli',
        deviceCode: grant.deviceCode,
      }),
    });
    return (await token.json()).data as Record<string, string>;
  }

  function publicRequest(
    pathname: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    return app.request(`${origin}/hub/api${pathname}`, { ...init, headers });
  }

  function browserRequest(
    pathname: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('cookie', cookie);
    if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
      headers.set('origin', origin);
      if (init.method !== 'DELETE' && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }
    return app.request(`${origin}/hub/api${pathname}`, { ...init, headers });
  }

  function agentRequest(
    pathname: string,
    token: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${token}`);
    return app.request(`${origin}/hub/api${pathname}`, {
      ...init,
      headers,
    });
  }
});

async function setupOwnerAndSignIn(app: HubApp): Promise<string> {
  const owner = await app.request(`${origin}/hub/api/setup/owner`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      email: 'owner@example.com',
      password: 'correct horse battery staple',
      name: 'Hub Owner',
      username: 'owner',
    }),
  });
  expect(owner.status).toBe(201);
  const signIn = await app.request(`${origin}/hub/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      email: 'owner@example.com',
      password: 'correct horse battery staple',
    }),
  });
  expect(signIn.status).toBe(200);
  return signIn.headers.get('set-cookie') ?? '';
}
