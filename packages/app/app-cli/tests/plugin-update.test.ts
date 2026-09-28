import { createRequire } from 'node:module';
import { symlink, mkdir } from 'node:fs/promises';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '@oclif/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadTestConfig, runCommand } from './helpers.ts';
import {
  normalizePluginPackageNames,
  planPluginUpdate,
} from '../src/lib/plugin-update.ts';

const created: string[] = [];
let config: Config;

beforeAll(async () => {
  config = await loadTestConfig();
});

afterEach(async () => {
  await Promise.all(
    created
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createApp(
  plugins: string[] = [],
  extra: Record<string, unknown> = {},
): Promise<string> {
  const appRoot = await mkdtemp(path.join(os.tmpdir(), 'nb3-update-'));
  created.push(appRoot);
  await writeFile(
    path.join(appRoot, 'package.json'),
    JSON.stringify({
      name: 'demo-app',
      ...extra,
    }),
  );
  await writeRegisteredPlugins(appRoot, plugins);
  return appRoot;
}

describe('normalizePluginPackageNames', () => {
  it('expands a short name into a plugin package', () => {
    expect(normalizePluginPackageNames(['audit-log'])).toEqual([
      '@nocobase/app-plugin-audit-log',
    ]);
  });

  it('keeps a full package name as given', () => {
    expect(
      normalizePluginPackageNames(['@nocobase/app-plugin-audit-log']),
    ).toEqual(['@nocobase/app-plugin-audit-log']);
  });

  it('rejects a scoped name from another namespace', () => {
    expect(() => normalizePluginPackageNames(['other/thing'])).toThrow(
      'must be a short name',
    );
  });

  it('rejects an empty name', () => {
    expect(() => normalizePluginPackageNames(['  '])).toThrow(
      'cannot be empty',
    );
  });
});

describe('planPluginUpdate', () => {
  it('upgrades every registered plugin when none is named', async () => {
    const appRoot = await createApp([
      '@nocobase/app-plugin-alpha',
      '@nocobase/app-plugin-beta',
    ]);

    const plan = await planPluginUpdate({ appRoot });

    expect(plan.packageNames).toEqual([
      '@nocobase/app-plugin-alpha',
      '@nocobase/app-plugin-beta',
    ]);
    expect(plan.args[0]).toBe('update');
  });

  it('upgrades only the named plugins', async () => {
    const appRoot = await createApp([
      '@nocobase/app-plugin-alpha',
      '@nocobase/app-plugin-beta',
    ]);

    const plan = await planPluginUpdate({ appRoot, plugins: ['alpha'] });

    expect(plan.packageNames).toEqual(['@nocobase/app-plugin-alpha']);
  });

  it('refuses a plugin the application does not register', async () => {
    const appRoot = await createApp(['@nocobase/app-plugin-alpha']);

    await expect(
      planPluginUpdate({ appRoot, plugins: ['missing'] }),
    ).rejects.toThrow('Not registered in this app');
  });

  it('reports no plugins rather than upgrading everything', async () => {
    const appRoot = await createApp();

    const plan = await planPluginUpdate({ appRoot });

    expect(plan.packageNames).toEqual([]);
    expect(plan.args).toEqual([]);
  });

  it('uses the package manager the application declares', async () => {
    const appRoot = await createApp(['@nocobase/app-plugin-alpha'], {
      packageManager: 'yarn@4.0.0',
    });

    const plan = await planPluginUpdate({ appRoot });

    expect(plan.packageManager).toBe('yarn');
    expect(plan.args[0]).toBe('up');
  });
});

describe('plugin update command selection', () => {
  it.each([
    { selectors: [], expected: ['alpha', 'beta'] },
    { selectors: ['@nocobase/app-plugin-alpha'], expected: ['alpha'] },
    { selectors: ['alpha'], expected: ['alpha'] },
  ])('selects $expected with $selectors', async ({ selectors, expected }) => {
    const appRoot = await createApp(
      ['@nocobase/app-plugin-alpha', '@nocobase/app-plugin-beta'],
      { packageManager: 'pnpm@11.0.0' },
    );
    const result = await runCommand(config, 'plugin:update', [
      ...selectors,
      '--dir',
      appRoot,
      '--dry-run',
      '--json',
    ]);
    const packageNames = expected.map((name) => `@nocobase/app-plugin-${name}`);

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      command: 'plugin update',
      result: {
        mode: 'dry-run',
        packageNames,
        commands: [
          {
            command: 'pnpm',
            args: ['update', ...packageNames],
            cwd: appRoot,
          },
        ],
      },
    });
  });

  it('rejects an unregistered positional name instead of updating all plugins', async () => {
    const appRoot = await createApp(['@nocobase/app-plugin-alpha']);

    await expect(
      runCommand(config, 'plugin:update', [
        '@nocobase/app-plugin-missing',
        '--dir',
        appRoot,
        '--dry-run',
      ]),
    ).rejects.toThrow('Not registered in this app');
  });

  it('accepts an optional name argument and exposes no plugin flag', () => {
    const command = config.findCommand('plugin:update', { must: true });

    expect(command.args.name.required).toBe(false);
    expect(command.flags).not.toHaveProperty('plugin');
  });
});

const PLUGIN = '@nocobase/app-plugin-alpha';
const CLIENT = '@nocobase/app-client';

async function writeInstalledPackage(
  appRoot: string,
  manifest: Record<string, unknown> & { name: string },
): Promise<void> {
  const directory = path.join(appRoot, 'node_modules', manifest.name);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify(manifest),
  );
}

/**
 * An application whose plugin now needs `@nocobase/app-client` ^1.0.0-beta.9 while `installedClient` is installed. The
 * fake pnpm on PATH records every invocation and, when asked to update the client, installs `updatedClient`.
 */
async function createPeerApp({
  declaredClient,
  installedClient,
  updatedClient,
}: {
  declaredClient: string;
  installedClient: string;
  updatedClient?: string;
}): Promise<{ appRoot: string; binRoot: string; calls: string }> {
  const appRoot = await createApp([PLUGIN], {
    packageManager: 'pnpm@11.0.0',
    dependencies: { [PLUGIN]: '^1.0.0-beta', [CLIENT]: declaredClient },
  });
  await writeInstalledPackage(appRoot, {
    name: PLUGIN,
    version: '1.0.0-beta.9',
    peerDependencies: { [CLIENT]: '^1.0.0-beta.9', react: '^19.0.0' },
    peerDependenciesMeta: { react: { optional: true } },
  });
  await writeInstalledPackage(appRoot, {
    name: CLIENT,
    version: installedClient,
  });

  const binRoot = path.join(appRoot, 'fake-bin');
  const calls = path.join(appRoot, 'package-manager-calls');
  const clientManifest = path.join(
    appRoot,
    'node_modules',
    CLIENT,
    'package.json',
  );
  await mkdir(binRoot, { recursive: true });
  const update =
    updatedClient === undefined
      ? ''
      : `if [ "$2" = '${CLIENT}' ]; then printf '%s' '${JSON.stringify({ name: CLIENT, version: updatedClient })}' > '${clientManifest}'; fi\n`;
  await writeFile(
    path.join(binRoot, 'pnpm'),
    `#!/bin/sh\necho "$@" >> '${calls}'\n${update}exit 0\n`,
  );
  await chmod(path.join(binRoot, 'pnpm'), 0o755);
  return { appRoot, binRoot, calls };
}

async function withPath<T>(binRoot: string, fn: () => Promise<T>): Promise<T> {
  const previousPath = process.env.PATH;
  process.env.PATH = `${binRoot}${path.delimiter}${previousPath ?? ''}`;
  try {
    return await fn();
  } finally {
    process.env.PATH = previousPath;
  }
}

describe('plugin update peer dependencies', () => {
  it('changes nothing else when the upgraded plugins peers are satisfied', async () => {
    const { appRoot, binRoot, calls } = await createPeerApp({
      declaredClient: '^1.0.0-beta',
      installedClient: '1.0.0-beta.9',
    });

    const result = await withPath(binRoot, () =>
      runCommand(config, 'plugin:update', ['--dir', appRoot, '--json']),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      status: 'success',
      result: { mode: 'update', packageNames: [PLUGIN], peerUpdates: [] },
    });
    expect(await readFile(calls, 'utf8')).toBe(`update ${PLUGIN}\n`);
  });

  it('updates a peer the upgrade left unsatisfied within the declared range', async () => {
    const { appRoot, binRoot, calls } = await createPeerApp({
      declaredClient: '^1.0.0-beta',
      installedClient: '1.0.0-beta.8',
      updatedClient: '1.0.0-beta.10',
    });

    const result = await withPath(binRoot, () =>
      runCommand(config, 'plugin:update', ['--dir', appRoot, '--json']),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      result: {
        mode: 'update',
        peerUpdates: [
          {
            packageNames: [CLIENT],
            args: ['update', CLIENT],
            unsatisfiedPeers: [
              {
                packageName: PLUGIN,
                peer: CLIENT,
                range: '^1.0.0-beta.9',
                installed: '1.0.0-beta.8',
              },
            ],
          },
        ],
        skills: { appPackageName: 'demo-app' },
      },
    });
    expect(await readFile(calls, 'utf8')).toBe(
      `update ${PLUGIN}\nupdate ${CLIENT}\n`,
    );
  });

  it('fails naming the plugin, peer, range and installed version when the declared range excludes it', async () => {
    const { appRoot, binRoot, calls } = await createPeerApp({
      declaredClient: '1.0.0-beta.8',
      installedClient: '1.0.0-beta.8',
    });

    const result = await withPath(binRoot, () =>
      runCommand(config, 'plugin:update', ['--dir', appRoot, '--json']),
    );

    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: 'PLUGIN_PEER_UNSATISFIED',
        message: expect.stringContaining(
          `${PLUGIN}@1.0.0-beta.9 needs ${CLIENT} ^1.0.0-beta.9, but 1.0.0-beta.8 is installed`,
        ) as unknown,
        suggestions: [
          {
            run: { command: 'pnpm', args: ['add', `${CLIENT}@^1.0.0-beta.9`] },
          },
          {
            run: {
              args: expect.arrayContaining(['plugin', 'update']) as unknown,
            },
          },
        ],
        details: {
          unsatisfiedPeers: [{ peer: CLIENT, installed: '1.0.0-beta.8' }],
        },
      },
    });
    expect(await readFile(calls, 'utf8')).toBe(`update ${PLUGIN}\n`);
    process.exitCode = undefined;
  });

  it('fails when updating the peer within its declared range still does not satisfy it', async () => {
    const { appRoot, binRoot, calls } = await createPeerApp({
      declaredClient: '^1.0.0-beta',
      installedClient: '1.0.0-beta.8',
    });

    await expect(
      withPath(binRoot, () =>
        runCommand(config, 'plugin:update', ['--dir', appRoot]),
      ),
    ).rejects.toThrow(
      `${PLUGIN}@1.0.0-beta.9 needs ${CLIENT} ^1.0.0-beta.9, but 1.0.0-beta.8 is installed`,
    );
    expect(await readFile(calls, 'utf8')).toBe(
      `update ${PLUGIN}\nupdate ${CLIENT}\n`,
    );
    process.exitCode = undefined;
  });
});

async function writeRegisteredPlugins(
  appRoot: string,
  packages: string[],
): Promise<void> {
  await mkdir(path.join(appRoot, 'server'), { recursive: true });
  await mkdir(path.join(appRoot, 'node_modules'), { recursive: true });
  await symlink(
    path.dirname(
      createRequire(import.meta.url).resolve('typescript/package.json'),
    ),
    path.join(appRoot, 'node_modules/typescript'),
    'junction',
  );
  await writeFile(
    path.join(appRoot, 'server/plugins.ts'),
    packages
      .map((name, index) => `import p${index} from '${name}/server';`)
      .join('\n') +
      `\nexport default defineServerPlugins([${packages.map((_, index) => `p${index}`).join(', ')}]);`,
  );
}
