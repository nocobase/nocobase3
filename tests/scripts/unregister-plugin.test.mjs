import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseUnregisterPluginArgs,
  unregisterPlugin,
} from '../../scripts/unregister-plugin.mjs';
import { removePlugin } from '../../scripts/remove-plugin.mjs';

const pluginPackageName = '@nocobase/app-plugin-audit-log';

test('parses the application selector and unregistration options', () => {
  assert.deepEqual(
    parseUnregisterPluginArgs([
      pluginPackageName,
      '--app',
      '@nocobase/app-template-default',
      '--dry-run',
      '--no-install',
    ]),
    {
      app: '@nocobase/app-template-default',
      dryRun: true,
      help: false,
      install: false,
      name: pluginPackageName,
    },
  );
});

test('unregisters a plugin from the default application', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot);

  const result = await unregisterPlugin({
    install: false,
    name: 'audit-log',
    repoRoot,
  });
  const appPackage = await readJson(appPackagePath);

  assert.equal(result.appPackageName, '@nocobase/app-template-default');
  assert.deepEqual(result.removedFrom, ['devDependencies', 'nocobase.plugins']);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      appPackage.devDependencies,
      pluginPackageName,
    ),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      appPackage.nocobase.plugins,
      pluginPackageName,
    ),
    false,
  );
  assert.equal(appPackage.devDependencies.other, 'workspace:^');
  assert.deepEqual(appPackage.nocobase.plugins.other, { enabled: true });
});

test('accepts a full application package name without plugin source', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot, {
    directoryName: 'custom-app',
    packageName: '@example/custom-app',
  });

  await unregisterPlugin({
    app: '@example/custom-app',
    install: false,
    name: 'audit-log',
    repoRoot,
  });
  const appPackage = await readJson(appPackagePath);

  assert.equal(appPackage.devDependencies[pluginPackageName], undefined);
  assert.equal(appPackage.nocobase.plugins[pluginPackageName], undefined);
});

test('dry-run validates without changing the application', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot);
  const before = await readFile(appPackagePath, 'utf8');

  const result = await unregisterPlugin({
    dryRun: true,
    name: 'audit-log',
    repoRoot,
  });

  assert.equal(result.changed, true);
  assert.equal(await readFile(appPackagePath, 'utf8'), before);
});

test('unregistration is idempotent and skips installation', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createApplicationPackage(repoRoot, {
    registered: false,
  });
  let synchronized = false;

  const result = await unregisterPlugin({
    name: 'audit-log',
    repoRoot,
    synchronize() {
      synchronized = true;
    },
  });

  assert.equal(result.changed, false);
  assert.deepEqual(result.removedFrom, []);
  assert.equal(synchronized, false);
});

test('removes whichever registration location exists', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot, {
    appPackage: {
      devDependencies: {
        other: 'workspace:^',
      },
    },
  });

  const result = await unregisterPlugin({
    install: false,
    name: 'audit-log',
    repoRoot,
  });
  const appPackage = await readJson(appPackagePath);

  assert.deepEqual(result.removedFrom, ['nocobase.plugins']);
  assert.deepEqual(appPackage.devDependencies, { other: 'workspace:^' });
  assert.equal(appPackage.nocobase.plugins[pluginPackageName], undefined);
});

test('allows plugin removal after unregistration', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPluginPackage(repoRoot);
  await createApplicationPackage(repoRoot);

  await unregisterPlugin({
    install: false,
    name: 'audit-log',
    repoRoot,
  });
  const result = await removePlugin({
    dryRun: true,
    install: false,
    name: 'audit-log',
    repoRoot,
  });

  assert.equal(result.packageName, pluginPackageName);
});

test('restores the application and lockfile when installation fails', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot);
  const originalAppPackage = await readFile(appPackagePath, 'utf8');
  const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml');
  await writeFile(lockfilePath, 'lockfileVersion: 9.0\noriginal: true\n');

  await assert.rejects(
    unregisterPlugin({
      name: 'audit-log',
      repoRoot,
      synchronize() {
        writeFileSync(lockfilePath, 'lockfileVersion: 9.0\nmodified: true\n');
        throw new Error('simulated install failure');
      },
    }),
    /was restored: simulated install failure/u,
  );

  assert.equal(await readFile(appPackagePath, 'utf8'), originalAppPackage);
  assert.equal(
    await readFile(lockfilePath, 'utf8'),
    'lockfileVersion: 9.0\noriginal: true\n',
  );
});

async function createTestRepo(t) {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-unregister-plugin-'),
  );
  await mkdir(path.join(repoRoot, 'packages'));
  t.after(() => rm(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

async function createPluginPackage(repoRoot) {
  const pluginDirectory = path.join(
    repoRoot,
    'packages',
    'app-plugin-audit-log',
  );
  await mkdir(pluginDirectory);
  await writeJson(path.join(pluginDirectory, 'package.json'), {
    name: pluginPackageName,
  });
}

async function createApplicationPackage(
  repoRoot,
  {
    appPackage,
    directoryName = 'app-template-default',
    packageName = '@nocobase/app-template-default',
    registered = true,
  } = {},
) {
  const appDirectory = path.join(repoRoot, 'packages', directoryName);
  await mkdir(appDirectory);
  const packageJsonPath = path.join(appDirectory, 'package.json');
  const defaultAppPackage = {
    devDependencies: {
      ...(registered ? { [pluginPackageName]: 'workspace:^' } : {}),
      other: 'workspace:^',
    },
    nocobase: {
      plugins: {
        ...(registered ? { [pluginPackageName]: { enabled: true } } : {}),
        other: { enabled: true },
      },
    },
  };
  await writeJson(packageJsonPath, {
    name: packageName,
    ...defaultAppPackage,
    ...appPackage,
  });
  return packageJsonPath;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
