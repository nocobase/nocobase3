import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseRegisterPluginArgs,
  registerPlugin,
} from '../../scripts/register-plugin.mjs';

test('parses the application selector and registration options', () => {
  assert.deepEqual(
    parseRegisterPluginArgs([
      '@nocobase/app-plugin-audit-log',
      '--app',
      '@nocobase/app-template-default',
      '--disabled',
      '--dry-run',
      '--no-install',
    ]),
    {
      app: '@nocobase/app-template-default',
      dryRun: true,
      enabled: false,
      help: false,
      install: false,
      name: '@nocobase/app-plugin-audit-log',
      skills: true,
    },
  );
});

test('registers a plugin in the default application', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot);

  const result = await registerPlugin({
    install: false,
    name: 'audit-log',
    repoRoot,
  });
  const appPackage = await readJson(appPackagePath);

  assert.equal(result.appPackageName, '@nocobase/app-template-default');
  assert.equal(result.changed, true);
  assert.equal(
    appPackage.devDependencies['@nocobase/app-plugin-audit-log'],
    'workspace:^',
  );
  assert.deepEqual(
    appPackage.nocobase.plugins['@nocobase/app-plugin-audit-log'],
    { enabled: true },
  );
});

test('accepts the full application package name and disabled state', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot, {
    directoryName: 'custom-app',
    packageName: '@example/custom-app',
  });

  await registerPlugin({
    app: '@example/custom-app',
    enabled: false,
    install: false,
    name: 'audit-log',
    repoRoot,
  });
  const appPackage = await readJson(appPackagePath);

  assert.deepEqual(
    appPackage.nocobase.plugins['@nocobase/app-plugin-audit-log'],
    { enabled: false },
  );
});

test('dry-run validates without changing the application', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot);
  const before = await readFile(appPackagePath, 'utf8');

  const result = await registerPlugin({
    dryRun: true,
    name: 'audit-log',
    repoRoot,
  });

  assert.equal(result.changed, true);
  assert.equal(await readFile(appPackagePath, 'utf8'), before);
});

test('registration is idempotent and preserves registration metadata', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot, {
    appPackage: {
      devDependencies: {
        '@nocobase/app-plugin-audit-log': 'workspace:^',
      },
      nocobase: {
        plugins: {
          '@nocobase/app-plugin-audit-log': {
            enabled: false,
            note: 'preserve me',
          },
        },
      },
    },
  });

  const first = await registerPlugin({
    install: false,
    name: 'audit-log',
    repoRoot,
  });
  let synchronized = false;
  const second = await registerPlugin({
    name: 'audit-log',
    repoRoot,
    synchronize() {
      synchronized = true;
    },
  });
  const appPackage = await readJson(appPackagePath);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(synchronized, false);
  assert.deepEqual(
    appPackage.nocobase.plugins['@nocobase/app-plugin-audit-log'],
    { enabled: true, note: 'preserve me' },
  );
});

test('refuses to overwrite a conflicting dependency range', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createApplicationPackage(repoRoot, {
    appPackage: {
      devDependencies: {
        '@nocobase/app-plugin-audit-log': '^1.0.0',
      },
    },
  });

  await assert.rejects(
    registerPlugin({ install: false, name: 'audit-log', repoRoot }),
    /refusing to overwrite/u,
  );
});

test('rejects an unknown application selector', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createApplicationPackage(repoRoot);

  await assert.rejects(
    registerPlugin({
      app: 'missing-app',
      install: false,
      name: 'audit-log',
      repoRoot,
    }),
    /Application package not found/u,
  );
});

test('restores the application and lockfile when installation fails', async (t) => {
  const repoRoot = await createTestRepo(t);
  const appPackagePath = await createApplicationPackage(repoRoot);
  const originalAppPackage = await readFile(appPackagePath, 'utf8');
  const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml');
  await writeFile(lockfilePath, 'lockfileVersion: 9.0\noriginal: true\n');

  await assert.rejects(
    registerPlugin({
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
    path.join(tmpdir(), 'nocobase-register-plugin-'),
  );
  await mkdir(path.join(repoRoot, 'packages'));
  await createPluginPackage(repoRoot, 'audit-log');
  t.after(() => rm(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

async function createPluginPackage(repoRoot, shortName) {
  const pluginDirectory = path.join(
    repoRoot,
    'packages',
    `app-plugin-${shortName}`,
  );
  await mkdir(pluginDirectory);
  await writeJson(path.join(pluginDirectory, 'package.json'), {
    name: `@nocobase/app-plugin-${shortName}`,
  });
}

async function createApplicationPackage(
  repoRoot,
  {
    appPackage = {},
    directoryName = 'app-template-default',
    packageName = '@nocobase/app-template-default',
  } = {},
) {
  const appDirectory = path.join(repoRoot, 'packages', directoryName);
  await mkdir(appDirectory);
  const packageJsonPath = path.join(appDirectory, 'package.json');
  await writeJson(packageJsonPath, {
    name: packageName,
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
