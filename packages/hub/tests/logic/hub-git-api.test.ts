// @vitest-environment node

import { createAdaptorServer, type ServerType } from '@hono/node-server';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApp, type HubApp } from '../../server/index.ts';

const execFileAsync = promisify(execFile);
const browserOrigin = 'http://127.0.0.1';
const authSecret = 'hub-git-api-test-secret-at-least-32-characters';

describe('Hub Git Smart HTTP', () => {
  let root: string;
  let app: HubApp;
  let server: ServerType | undefined;
  let cookie: string;
  let applicationId: string;
  let accessToken: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'hub-git-api-'));
    const seed = await createRepositorySeed(root);
    app = createApp({
      appName: 'hub',
      basePath: '/hub',
      browserBasePath: '/hub',
      hub: true,
      databasePath: path.join(root, 'hub.sqlite'),
      authSecret,
      authBaseUrl: `${browserOrigin}/hub/api/auth`,
      sourceRoot: path.join(root, 'sources'),
      repositorySeedPath: seed,
      releaseRoot: path.join(root, 'releases'),
      runtimeSecretEncryptionKey: Buffer.alloc(32, 9).toString('base64'),
    });
    await app.hubReady;
    cookie = await setupOwnerAndSignIn();
    const create = await browserRequest('/apps', {
      method: 'POST',
      headers: { 'idempotency-key': 'create-git-app' },
      body: JSON.stringify({ slug: 'git-app', name: 'Git APP' }),
    });
    applicationId = (await create.json()).data.id as string;
    accessToken = await authorizeAgent();
  });

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server!.close((error?: Error) => (error ? reject(error) : resolve())),
      );
    }
    await app.close?.();
    await rm(root, { recursive: true, force: true });
  });

  it('clones and fast-forward pushes main with Basic Agent authentication', async () => {
    const origin = await startHttpServer();
    const repositoryUrl = `http://oauth2:${accessToken}@${new URL(origin).host}/hub/git/git-app.git`;
    const worktree = path.join(root, 'clone');

    await execFileAsync('git', [
      'clone',
      '--branch',
      'main',
      '--',
      repositoryUrl,
      worktree,
    ]);
    expect(await readFile(path.join(worktree, 'README.md'), 'utf8')).toContain(
      'Default APP',
    );
    await writeFile(path.join(worktree, 'README.md'), '# Updated by Agent\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: worktree });
    await execFileAsync('git', ['commit', '-m', 'Update source'], {
      cwd: worktree,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Agent',
        GIT_AUTHOR_EMAIL: 'agent@example.com',
        GIT_COMMITTER_NAME: 'Agent',
        GIT_COMMITTER_EMAIL: 'agent@example.com',
      },
    });
    const pushedCommit = (
      await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: worktree })
    ).stdout.trim();
    await execFileAsync('git', ['push', 'origin', 'main'], { cwd: worktree });

    await expectRepositoryHead(pushedCommit);
    const audit = await browserRequest(
      `/audit-logs?applicationId=${applicationId}&source=git`,
    );
    await expect(audit.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          action: 'repository.pushed',
          source: 'git',
          applicationId,
        }),
      ],
    });
  });

  it('challenges missing or invalid credentials before disclosing a repository', async () => {
    const origin = await startHttpServer();
    const validRepository = `${origin}/hub/git/git-app.git/info/refs?service=git-upload-pack`;
    const missingRepository = `${origin}/hub/git/missing.git/info/refs?service=git-upload-pack`;

    const anonymous = await fetch(validRepository);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toContain('Basic');

    const invalid = await fetch(missingRepository, {
      headers: {
        authorization: `Basic ${Buffer.from('oauth2:not-a-token').toString('base64')}`,
      },
    });
    expect(invalid.status).toBe(401);
  });

  async function startHttpServer(): Promise<string> {
    server = createAdaptorServer({ fetch: app.fetch });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing server address.');
    }
    return `http://127.0.0.1:${address.port}`;
  }

  async function expectRepositoryHead(expected: string): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const response = await browserRequest(
        `/apps/${applicationId}/repository`,
      );
      const repository = (await response.json()).data;
      if (repository.headCommit === expected) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('Repository metadata was not updated after push.');
  }

  async function authorizeAgent(): Promise<string> {
    const device = await publicRequest('/agent-auth/device', {
      method: 'POST',
      body: JSON.stringify({
        clientId: 'nb-cli',
        clientName: 'Git Agent',
        scopes: ['source:read', 'source:write'],
        applicationScope: { mode: 'selected', applicationIds: [applicationId] },
      }),
    });
    const grant = (await device.json()).data;
    const resolved = await browserRequest('/agent-authorizations/resolve', {
      method: 'POST',
      body: JSON.stringify({ userCode: grant.userCode }),
    });
    const authorization = (await resolved.json()).data;
    const approved = await browserRequest(
      `/agent-authorizations/${authorization.id}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          scopes: ['source:read', 'source:write'],
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
    return (await token.json()).data.accessToken as string;
  }

  async function setupOwnerAndSignIn(): Promise<string> {
    const owner = await publicRequest('/setup/owner', {
      method: 'POST',
      headers: { origin: browserOrigin },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
        name: 'Hub Owner',
        username: 'owner',
      }),
    });
    expect(owner.status).toBe(201);
    const signIn = await publicRequest('/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: browserOrigin },
      body: JSON.stringify({
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      }),
    });
    expect(signIn.status).toBe(200);
    return signIn.headers.get('set-cookie') ?? '';
  }

  function publicRequest(
    pathname: string,
    init: RequestInit,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    return app.request(`${browserOrigin}/hub/api${pathname}`, {
      ...init,
      headers,
    });
  }

  function browserRequest(
    pathname: string,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('cookie', cookie);
    if (init.method && init.method !== 'GET' && init.method !== 'HEAD') {
      headers.set('origin', browserOrigin);
      headers.set('content-type', 'application/json');
    }
    return app.request(`${browserOrigin}/hub/api${pathname}`, {
      ...init,
      headers,
    });
  }
});

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
