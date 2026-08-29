import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CredentialStore,
  type StoredCredential,
} from '../src/lib/credential-store.ts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('CredentialStore', () => {
  it('persists credentials outside app workspaces with restrictive permissions', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-credentials-'));
    roots.push(root);
    const store = new CredentialStore(root);
    const credential: StoredCredential = {
      hub: 'https://hub.example.com/hub',
      accessToken: 'access-secret',
      accessTokenExpiresAt: Date.now() + 60_000,
      refreshToken: 'refresh-secret',
      refreshTokenExpiresAt: Date.now() + 86_400_000,
      credentialId: 'credential-1',
      scopes: ['profile'],
      applicationScope: { mode: 'all-authorized' },
    };

    await store.set(credential);
    const loaded = await store.get(credential.hub);
    expect(loaded).toEqual(credential);
    expect((await stat(store.filePath())).mode & 0o777).toBe(0o600);
    expect(await readFile(store.filePath(), 'utf8')).not.toContain(
      'https://hub.example.com/hub/api',
    );
  });

  it('removes one Hub credential without affecting another Hub', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-credentials-'));
    roots.push(root);
    const store = new CredentialStore(root);
    await store.set({
      hub: 'https://one.example.com/hub',
      accessToken: 'a',
      accessTokenExpiresAt: null,
      refreshToken: 'r',
      refreshTokenExpiresAt: null,
      credentialId: '1',
      scopes: ['profile'],
      applicationScope: { mode: 'all-authorized' },
    });
    await store.set({
      hub: 'https://two.example.com/hub',
      accessToken: 'b',
      accessTokenExpiresAt: null,
      refreshToken: 's',
      refreshTokenExpiresAt: null,
      credentialId: '2',
      scopes: ['profile'],
      applicationScope: { mode: 'all-authorized' },
    });

    await store.remove('https://one.example.com/hub/');
    expect(await store.get('https://one.example.com/hub')).toBeUndefined();
    expect((await store.get('https://two.example.com/hub'))?.credentialId).toBe(
      '2',
    );
  });
});
