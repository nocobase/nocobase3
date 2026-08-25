import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  APP_RELEASE_STATE_DIRECTORY,
  AppReleaseStateStore,
  parseAppReleaseState,
} from '../dist/index.js';

const tempDirs: string[] = [];
const checksumA = 'a'.repeat(64);
const checksumB = 'b'.repeat(64);

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

it('persists active releases atomically and converges repeated writes', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-release-state-'),
  );
  tempDirs.push(appsDir);
  let now = new Date('2026-08-19T01:00:00.000Z');
  const store = new AppReleaseStateStore({
    appsDir,
    now: () => now,
  });

  await expect(store.read()).resolves.toEqual({
    schemaVersion: 1,
    releases: [],
  });

  const first = await store.setActiveRelease({
    appId: 'orders',
    releaseId: 'release-v1',
    artifactSha256: checksumA,
  });
  expect(first).toEqual({
    appId: 'orders',
    releaseId: 'release-v1',
    artifactSha256: checksumA,
    activatedAt: '2026-08-19T01:00:00.000Z',
  });

  const initialContent = await readFile(store.stateFile, 'utf8');
  now = new Date('2026-08-19T02:00:00.000Z');
  await store.setActiveRelease({
    appId: 'orders',
    releaseId: 'release-v1',
    artifactSha256: checksumA,
  });
  expect(await readFile(store.stateFile, 'utf8')).toBe(initialContent);

  await Promise.all([
    store.setActiveRelease({
      appId: 'billing',
      releaseId: 'release-v3',
      artifactSha256: checksumB,
    }),
    store.setActiveRelease({
      appId: 'support',
      releaseId: 'release-v2',
      artifactSha256: checksumA,
    }),
  ]);

  await expect(store.read()).resolves.toMatchObject({
    schemaVersion: 1,
    releases: [
      { appId: 'billing', releaseId: 'release-v3' },
      { appId: 'orders', releaseId: 'release-v1' },
      { appId: 'support', releaseId: 'release-v2' },
    ],
  });
  expect((await stat(store.stateFile)).mode & 0o777).toBe(0o600);
  expect(
    (await readdir(path.join(appsDir, APP_RELEASE_STATE_DIRECTORY))).filter(
      (entry) => entry.endsWith('.tmp'),
    ),
  ).toEqual([]);

  await expect(store.clearActiveRelease('orders')).resolves.toBe(true);
  await expect(store.clearActiveRelease('orders')).resolves.toBe(false);
  expect((await store.read()).releases.map((release) => release.appId)).toEqual(
    ['billing', 'support'],
  );
});

it('fails closed for malformed or ambiguous state', async () => {
  const appsDir = await mkdtemp(
    path.join(os.tmpdir(), 'nocobase-app-release-state-invalid-'),
  );
  tempDirs.push(appsDir);
  const store = new AppReleaseStateStore({ appsDir });

  expect(() =>
    parseAppReleaseState(
      JSON.stringify({
        schemaVersion: 1,
        releases: [
          {
            appId: 'orders',
            releaseId: 'release-v1',
            artifactSha256: checksumA,
            activatedAt: '2026-08-19T01:00:00.000Z',
          },
          {
            appId: 'orders',
            releaseId: 'release-v2',
            artifactSha256: checksumB,
            activatedAt: '2026-08-19T02:00:00.000Z',
          },
        ],
      }),
    ),
  ).toThrow('duplicate appId orders');

  await store.setActiveRelease({
    appId: 'orders',
    releaseId: 'release-v1',
    artifactSha256: checksumA,
  });
  await writeFile(
    store.stateFile,
    '{"schemaVersion":1,"releases":[],"ignored":true}',
    'utf8',
  );
  await expect(store.read()).rejects.toThrow('unexpected: ignored');
});
