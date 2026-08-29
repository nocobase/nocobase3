import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialStore } from '../src/lib/credential-store.ts';
import { loadTestConfig, runCommand } from './helpers.ts';

const HUB = 'https://hub.example.com/hub';
let root: string;
let originalRoot: string | undefined;
let originalPath: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'nb3-agent-commands-'));
  originalRoot = process.env.NB3_CLI_ROOT;
  originalPath = process.env.PATH;
  process.env.NB3_CLI_ROOT = path.join(root, 'user-data');
});

afterEach(async () => {
  vi.unstubAllGlobals();
  restoreEnvironment('NB3_CLI_ROOT', originalRoot);
  restoreEnvironment('PATH', originalPath);
  await rm(root, { recursive: true, force: true });
});

describe('Hub agent commands', () => {
  it('logs in with the minimum read scopes by default and persists the token', async () => {
    const fetchMock = loginFetch(
      'profile apps:read releases:read deployments:read runtime:read',
    );
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();
    const result = await runCommand(config, 'hub:login', [
      '--hub',
      HUB,
      '--json',
    ]);

    const deviceBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(deviceBody.scopes).toEqual([
      'profile',
      'apps:read',
      'releases:read',
      'deployments:read',
      'runtime:read',
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      hub: HUB,
      credentialId: 'credential',
    });
    expect(await new CredentialStore().get(HUB)).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      credentialId: 'credential',
    });
  });

  it('supports explicit repeated scopes', async () => {
    const fetchMock = loginFetch('apps:read releases:publish');
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();

    await runCommand(config, 'hub:login', [
      '--hub',
      HUB,
      '--scope',
      'apps:read',
      '--scope',
      'releases:publish',
    ]);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.scopes).toEqual(['apps:read', 'releases:publish']);
  });

  it('lists applications as one JSON result using the persisted credential', async () => {
    await saveCredential();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { id: 'app-1', slug: 'sales', name: 'Sales', status: 'active' },
          ],
          meta: { total: 1, limit: 20, offset: 0 },
          requestId: 'req-list',
        }),
      ),
    );
    const config = await loadTestConfig();
    const result = await runCommand(config, 'app:list', [
      '--hub',
      HUB,
      '--json',
    ]);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      hub: HUB,
      applications: [{ id: 'app-1', slug: 'sales' }],
      pagination: { total: 1, limit: 20, offset: 0 },
      requestId: 'req-list',
    });
  });

  it('revokes the remote refresh token before removing the local credential', async () => {
    await saveCredential();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { revoked: true } }));
    vi.stubGlobal('fetch', fetchMock);
    const config = await loadTestConfig();
    const result = await runCommand(config, 'hub:logout', [
      '--hub',
      HUB,
      '--json',
    ]);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      clientId: 'nb3-cli',
      refreshToken: 'refresh',
    });
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      alreadyLoggedOut: false,
    });
    expect(await new CredentialStore().get(HUB)).toBeUndefined();
  });
});

async function saveCredential(): Promise<void> {
  await new CredentialStore().set({
    hub: HUB,
    clientId: 'nb3-cli',
    credentialId: 'credential',
    accessToken: 'access',
    accessTokenExpiresAt: Date.now() + 600_000,
    refreshToken: 'refresh',
    refreshTokenExpiresAt: Date.now() + 3_600_000,
    scopes: ['profile', 'apps:read', 'releases:read'],
    applicationScope: { mode: 'all-authorized' },
  });
}

function loginFetch(scope: string): ReturnType<typeof vi.fn> {
  return vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse(
        {
          data: {
            deviceCode: 'device',
            userCode: 'ABCD',
            verificationUri: `${HUB}/agent-authorize`,
            expiresIn: 600,
            interval: 0,
          },
        },
        201,
      ),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        data: {
          credentialId: 'credential',
          accessToken: 'access',
          tokenType: 'Bearer',
          expiresIn: 900,
          refreshToken: 'refresh',
          refreshExpiresIn: 3600,
          scope,
          applicationScope: { mode: 'all-authorized' },
        },
      }),
    );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
