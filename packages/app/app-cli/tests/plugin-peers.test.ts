import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  findUnsatisfiedPeers,
  peerFixCommand,
  peerUpdateArgs,
  planPeerFixes,
  type UnsatisfiedPeer,
} from '../src/lib/plugin-peers.ts';

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-peers-'));
  created.push(root);
  return root;
}

async function writePackage(
  directory: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify(manifest),
  );
}

const PLUGIN = '@nocobase/app-plugin-alpha';
const CLIENT = '@nocobase/app-client';

describe('findUnsatisfiedPeers', () => {
  it('reports a peer whose installed version is outside the required range', async () => {
    const appRoot = await createRoot();
    await writePackage(path.join(appRoot, 'node_modules', PLUGIN), {
      name: PLUGIN,
      version: '1.0.0-beta.9',
      peerDependencies: { [CLIENT]: '^1.0.0-beta.9' },
    });
    await writePackage(path.join(appRoot, 'node_modules', CLIENT), {
      name: CLIENT,
      version: '1.0.0-beta.8',
    });

    await expect(
      findUnsatisfiedPeers({ appRoot, packageNames: [PLUGIN] }),
    ).resolves.toEqual([
      {
        packageName: PLUGIN,
        packageVersion: '1.0.0-beta.9',
        peer: CLIENT,
        range: '^1.0.0-beta.9',
        installed: '1.0.0-beta.8',
      },
    ]);
  });

  it('accepts a satisfied prerelease peer and skips non-semver ranges', async () => {
    const appRoot = await createRoot();
    await writePackage(path.join(appRoot, 'node_modules', PLUGIN), {
      name: PLUGIN,
      version: '1.0.0-beta.9',
      peerDependencies: { [CLIENT]: '^1.0.0-beta.2', linked: 'workspace:^' },
    });
    await writePackage(path.join(appRoot, 'node_modules', CLIENT), {
      name: CLIENT,
      version: '1.0.0-beta.8',
    });

    await expect(
      findUnsatisfiedPeers({ appRoot, packageNames: [PLUGIN] }),
    ).resolves.toEqual([]);
  });

  it('skips a missing optional peer but checks an installed one and a missing required one', async () => {
    const appRoot = await createRoot();
    await writePackage(path.join(appRoot, 'node_modules', PLUGIN), {
      name: PLUGIN,
      version: '2.0.0',
      peerDependencies: {
        absent: '^1.0.0',
        'installed-optional': '^2.0.0',
        required: '^1.0.0',
      },
      peerDependenciesMeta: {
        absent: { optional: true },
        'installed-optional': { optional: true },
      },
    });
    await writePackage(
      path.join(appRoot, 'node_modules', 'installed-optional'),
      {
        name: 'installed-optional',
        version: '1.5.0',
      },
    );

    const unsatisfied = await findUnsatisfiedPeers({
      appRoot,
      packageNames: [PLUGIN, '@nocobase/app-plugin-not-installed'],
    });

    expect(unsatisfied.map(({ peer, installed }) => [peer, installed])).toEqual(
      [
        ['installed-optional', '1.5.0'],
        ['required', null],
      ],
    );
  });

  it('resolves the peer linked beside the package, as pnpm links it, rather than the root copy', async () => {
    const appRoot = await createRoot();
    const store = path.join(
      appRoot,
      'node_modules/.pnpm/@nocobase+app-plugin-alpha@1.0.0/node_modules',
    );
    await writePackage(path.join(store, PLUGIN), {
      name: PLUGIN,
      version: '1.0.0',
      peerDependencies: { [CLIENT]: '^1.0.0-beta.9' },
    });
    await writePackage(path.join(store, CLIENT), {
      name: CLIENT,
      version: '1.0.0-beta.8',
    });
    await writePackage(path.join(appRoot, 'node_modules', CLIENT), {
      name: CLIENT,
      version: '1.0.0-beta.9',
    });
    await mkdir(path.join(appRoot, 'node_modules/@nocobase'), {
      recursive: true,
    });
    await symlink(
      path.join(store, PLUGIN),
      path.join(appRoot, 'node_modules', PLUGIN),
      'junction',
    );

    const unsatisfied = await findUnsatisfiedPeers({
      appRoot,
      packageNames: [PLUGIN],
    });

    expect(unsatisfied).toMatchObject([{ installed: '1.0.0-beta.8' }]);
  });
});

describe('planPeerFixes', () => {
  const entry: UnsatisfiedPeer = {
    packageName: PLUGIN,
    packageVersion: '1.0.0-beta.9',
    peer: CLIENT,
    range: '^1.0.0-beta.9',
    installed: '1.0.0-beta.8',
  };

  it('updates a peer whose declared range admits the required version', () => {
    expect(
      planPeerFixes({
        applicationPackage: { dependencies: { [CLIENT]: '^1.0.0-beta' } },
        unsatisfied: [entry],
        alreadyUpdated: new Set(),
      }),
    ).toEqual({ updatable: [CLIENT], blocked: [] });
  });

  it('blocks a peer the app pins below, does not declare, or already updated', () => {
    for (const [applicationPackage, alreadyUpdated] of [
      [{ dependencies: { [CLIENT]: '1.0.0-beta.8' } }, new Set<string>()],
      [{}, new Set<string>()],
      [{ devDependencies: { [CLIENT]: '^1.0.0-beta' } }, new Set([CLIENT])],
    ] as const) {
      expect(
        planPeerFixes({
          applicationPackage,
          unsatisfied: [entry],
          alreadyUpdated,
        }),
      ).toEqual({ updatable: [], blocked: [entry] });
    }
  });
});

describe('peer commands', () => {
  const applicationPackage = { devDependencies: { [CLIENT]: '^1.0.0-beta' } };

  it('keeps a yarn update inside the declared range', () => {
    expect(peerUpdateArgs('yarn', applicationPackage, [CLIENT])).toEqual([
      'up',
      `${CLIENT}@^1.0.0-beta`,
    ]);
    expect(peerUpdateArgs('npm', applicationPackage, [CLIENT])).toEqual([
      'update',
      CLIENT,
    ]);
  });

  it('installs a blocked peer at the required range into its declared section', () => {
    const entries: UnsatisfiedPeer[] = [
      {
        packageName: PLUGIN,
        packageVersion: '1.0.0',
        peer: CLIENT,
        range: '^1.0.0-beta.9',
        installed: '1.0.0-beta.8',
      },
    ];
    expect(
      peerFixCommand('npm', applicationPackage, CLIENT, entries, false),
    ).toEqual({
      command: 'npm',
      args: ['install', '-D', `${CLIENT}@^1.0.0-beta.9`],
    });
    expect(peerFixCommand('pnpm', {}, CLIENT, entries, false)).toEqual({
      command: 'pnpm',
      args: ['add', `${CLIENT}@^1.0.0-beta.9`],
    });
  });
});
