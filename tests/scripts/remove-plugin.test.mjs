import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  parseRemovePluginArgs,
  removePlugin,
} from '../../scripts/remove-plugin.mjs';

test('parses removal options', () => {
  assert.deepEqual(
    parseRemovePluginArgs([
      '@nocobase/app-plugin-audit-log',
      '--dry-run',
      '--no-install',
    ]),
    {
      dryRun: true,
      help: false,
      install: false,
      name: '@nocobase/app-plugin-audit-log',
    },
  );
});

test('removes an unreferenced plugin without changing the lockfile', async (t) => {
  const repoRoot = await createTestRepo(t);
  const targetDirectory = await createPluginPackage(repoRoot, 'audit-log');
  const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml');
  await writeFile(lockfilePath, 'lockfileVersion: 9.0\n');

  const result = await removePlugin({
    install: false,
    name: 'audit-log',
    repoRoot,
  });

  assert.equal(result.packageName, '@nocobase/app-plugin-audit-log');
  await assert.rejects(access(targetDirectory), { code: 'ENOENT' });
  assert.equal(await readFile(lockfilePath, 'utf8'), 'lockfileVersion: 9.0\n');
});

test('dry-run validates but preserves the plugin', async (t) => {
  const repoRoot = await createTestRepo(t);
  const targetDirectory = await createPluginPackage(repoRoot, 'audit-log');

  await removePlugin({
    dryRun: true,
    install: false,
    name: 'app-plugin-audit-log',
    repoRoot,
  });

  await access(targetDirectory);
});

test('refuses removal while a workspace package references the plugin', async (t) => {
  const repoRoot = await createTestRepo(t);
  const targetDirectory = await createPluginPackage(repoRoot, 'audit-log');
  const appDirectory = path.join(repoRoot, 'packages/app');
  await mkdir(appDirectory);
  await writeJson(path.join(appDirectory, 'package.json'), {
    name: '@nocobase/app',
    dependencies: {
      '@nocobase/app-plugin-audit-log': 'workspace:^',
    },
    nocobase: {
      plugins: {
        '@nocobase/app-plugin-audit-log': { enabled: true },
      },
    },
  });

  await assert.rejects(
    removePlugin({ install: false, name: 'audit-log', repoRoot }),
    (error) => {
      assert.match(error.message, /packages\/app\/package\.json/u);
      assert.match(error.message, /dependencies/u);
      assert.match(error.message, /nocobase\.plugins/u);
      assert.match(
        error.message,
        /pnpm plugin:unregister audit-log --app app/u,
      );
      return true;
    },
  );
  await access(targetDirectory);
});

test('refuses a directory whose package name does not match', async (t) => {
  const repoRoot = await createTestRepo(t);
  const targetDirectory = path.join(repoRoot, 'packages/app-plugin-audit-log');
  await mkdir(targetDirectory);
  await writeJson(path.join(targetDirectory, 'package.json'), {
    name: '@nocobase/app-plugin-something-else',
  });

  await assert.rejects(
    removePlugin({ install: false, name: 'audit-log', repoRoot }),
    /expected package name/u,
  );
  await access(targetDirectory);
});

test('refuses removal while server/plugins.ts imports the plugin', async (t) => {
  const repoRoot = await createTestRepo(t);
  const targetDirectory = await createPluginPackage(repoRoot, 'audit-log');
  const appDirectory = path.join(repoRoot, 'packages/app');
  await mkdir(path.join(appDirectory, 'server'), { recursive: true });
  await writeJson(path.join(appDirectory, 'package.json'), {
    name: '@nocobase/app',
  });
  await writeFile(
    path.join(appDirectory, 'server/plugins.ts'),
    `import auditLog from '@nocobase/app-plugin-audit-log/server';
import { defineServerPlugins } from '@nocobase/app-server-kit/plugins';

export default defineServerPlugins([auditLog]);
`,
  );

  await assert.rejects(
    removePlugin({ install: false, name: 'audit-log', repoRoot }),
    (error) => {
      assert.match(error.message, /server\/plugins\.ts/u);
      assert.match(
        error.message,
        /pnpm plugin:unregister audit-log --app app/u,
      );
      return true;
    },
  );
  await access(targetDirectory);
});

test('restores the plugin and lockfile when synchronization fails', async (t) => {
  const repoRoot = await createTestRepo(t);
  const targetDirectory = await createPluginPackage(repoRoot, 'audit-log');
  const lockfilePath = path.join(repoRoot, 'pnpm-lock.yaml');
  await writeFile(lockfilePath, 'lockfileVersion: 9.0\noriginal: true\n');

  await assert.rejects(
    removePlugin({
      name: 'audit-log',
      repoRoot,
      synchronize() {
        writeFileSync(lockfilePath, 'lockfileVersion: 9.0\nmodified: true\n');
        throw new Error('simulated install failure');
      },
    }),
    /was restored: simulated install failure/u,
  );

  await access(targetDirectory);
  assert.equal(
    await readFile(lockfilePath, 'utf8'),
    'lockfileVersion: 9.0\noriginal: true\n',
  );
  assert.deepEqual(
    (await readdir(repoRoot)).filter((entry) =>
      entry.startsWith('.plugin-remove-'),
    ),
    [],
  );
});

async function createTestRepo(t) {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-remove-plugin-'),
  );
  await mkdir(path.join(repoRoot, 'packages'));
  await writeJson(path.join(repoRoot, 'package.json'), {
    name: 'test-workspace',
    private: true,
  });
  t.after(() => rm(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

async function createPluginPackage(repoRoot, shortName) {
  const targetDirectory = path.join(
    repoRoot,
    `packages/app-plugin-${shortName}`,
  );
  await mkdir(targetDirectory);
  await writeJson(path.join(targetDirectory, 'package.json'), {
    name: `@nocobase/app-plugin-${shortName}`,
  });
  return targetDirectory;
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
