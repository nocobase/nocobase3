import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  normalizePluginPackageNames,
  planPluginUpdate,
} from '../src/lib/plugin-update.ts';

const created: string[] = [];

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
      nocobase: {
        plugins: Object.fromEntries(
          plugins.map((name) => [name, { enabled: true }]),
        ),
      },
      ...extra,
    }),
  );
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
