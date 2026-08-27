import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CredentialStore } from '../src/lib/credential-store.ts';
import {
  HubCredentialError,
  HubCredentialManager,
} from '../src/lib/hub-auth.ts';

const roots: string[] = [];
const HUB = 'https://hub.example.com/hub';

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('HubCredentialManager', () => {
  it('refreshes an expired access token and atomically saves the rotation', async () => {
    const store = await createStore();
    await store.set({
      hub: HUB,
      clientId: 'nb3-cli',
      credentialId: 'old-credential',
      accessToken: 'old-access',
      accessTokenExpiresAt: 900,
      refreshToken: 'old-refresh',
      refreshTokenExpiresAt: 10_000,
      scopes: ['apps:read'],
      applicationScope: { mode: 'all-authorized' },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            credentialId: 'new-credential',
            accessToken: 'new-access',
            tokenType: 'Bearer',
            expiresIn: 900,
            refreshToken: 'new-refresh',
            refreshExpiresIn: 3600,
            scope: 'apps:read',
            applicationScope: { mode: 'all-authorized' },
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const manager = new HubCredentialManager(HUB, {
      store,
      clock: () => 1_000,
    });

    await expect(
      manager.requireCredential(['apps:read']),
    ).resolves.toMatchObject({
      credentialId: 'new-credential',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      grantType: 'refresh_token',
      clientId: 'nb3-cli',
      refreshToken: 'old-refresh',
    });
    expect(await store.get(HUB)).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('gives a copyable login command when a scope is missing', async () => {
    const store = await createStore();
    await store.set({
      hub: HUB,
      credentialId: 'credential',
      accessToken: 'access',
      accessTokenExpiresAt: null,
      refreshToken: 'refresh',
      refreshTokenExpiresAt: null,
      scopes: ['apps:read'],
      applicationScope: { mode: 'all-authorized' },
    });
    const manager = new HubCredentialManager(HUB, { store });

    await expect(
      manager.requireCredential(['releases:publish']),
    ).rejects.toMatchObject<Partial<HubCredentialError>>({
      code: 'INSUFFICIENT_SCOPE',
      hint: `nb3 hub login --hub ${HUB} --scope releases:publish`,
    });
  });

  it('can start device authorization and retry the operation for app package scripts', async () => {
    const store = await createStore();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              deviceCode: 'device',
              userCode: 'ABCD',
              verificationUri: `${HUB}/agent-authorize`,
              expiresIn: 600,
              interval: 0,
            },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              credentialId: 'credential',
              accessToken: 'access',
              tokenType: 'Bearer',
              expiresIn: 900,
              refreshToken: 'refresh',
              refreshExpiresIn: 3600,
              scope: 'apps:read releases:read',
              applicationScope: { mode: 'all-authorized' },
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const manager = new HubCredentialManager(HUB, { store });
    const report = vi.fn();

    const result = await manager.authorizedWithDeviceLogin(
      ['apps:read', 'releases:read'],
      { clientName: 'NocoBase app scripts test', reportAuthorization: report },
      async (_client, credential) => credential.accessToken,
    );

    expect(result).toBe('access');
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ userCode: 'ABCD' }),
    );
    expect(await store.get(HUB)).toMatchObject({
      accessToken: 'access',
      scopes: ['apps:read', 'releases:read'],
    });
  });
});

async function createStore(): Promise<CredentialStore> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-hub-auth-'));
  roots.push(root);
  return new CredentialStore(root);
}
