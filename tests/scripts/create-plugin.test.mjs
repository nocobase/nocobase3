import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPlugin,
  parseCreatePluginArgs,
} from '../../scripts/create-plugin.mjs';

test('parses scaffold options', () => {
  assert.deepEqual(
    parseCreatePluginArgs([
      '@nocobase/app-plugin-audit-log',
      '--display-name',
      'Audit Log',
      '--description',
      'Tracks changes.',
      '--no-install',
    ]),
    {
      description: 'Tracks changes.',
      displayName: 'Audit Log',
      dryRun: false,
      help: false,
      install: false,
      name: '@nocobase/app-plugin-audit-log',
    },
  );
});

test('creates a complete dev-config based plugin without src', async (t) => {
  const repoRoot = await createTestRepo(t);
  const result = await createPlugin({
    install: false,
    name: 'audit-log',
    now: new Date(2026, 7, 22),
    repoRoot,
  });
  const packageJson = JSON.parse(
    await readFile(path.join(result.targetDirectory, 'package.json'), 'utf8'),
  );
  const tsconfigContents = await readFile(
    path.join(result.targetDirectory, 'tsconfig.json'),
    'utf8',
  );
  const tsconfig = JSON.parse(tsconfigContents);

  assert.equal(packageJson.name, '@nocobase/app-plugin-audit-log');
  assert.equal(packageJson.prettier, '@nocobase/dev-config/prettier');
  assert.deepEqual(packageJson.exports, {
    './package.json': './package.json',
  });
  assert.deepEqual(packageJson.nocobase.plugin.database, {
    migrations: './database/migrations',
    seeds: './database/seeds',
  });
  assert.equal(packageJson.dependencies['@nocobase/database'], 'workspace:^');
  assert.equal(packageJson.dependencies.hono, 'catalog:');
  assert.equal(
    tsconfig.extends,
    '@nocobase/dev-config/tsconfig/server-library.json',
  );
  assert.deepEqual(tsconfig.include, ['server/**/*.ts', 'database/**/*.ts']);
  assert.equal(
    tsconfigContents,
    `{\n  "extends": "@nocobase/dev-config/tsconfig/server-library.json",\n  "compilerOptions": {\n    "rootDir": ".",\n    "outDir": "dist"\n  },\n  "include": ["server/**/*.ts", "database/**/*.ts"]\n}\n`,
  );
  await assert.rejects(
    readFile(path.join(result.targetDirectory, 'src/index.ts'), 'utf8'),
    { code: 'ENOENT' },
  );
  await readFile(
    path.join(result.targetDirectory, 'server/bootstrap.ts'),
    'utf8',
  );
  await readFile(
    path.join(result.targetDirectory, 'tests/bootstrap.test.ts'),
    'utf8',
  );
  await readFile(
    path.join(result.targetDirectory, 'database/README.md'),
    'utf8',
  );
  await readFile(
    path.join(
      result.targetDirectory,
      'database/migrations/202608220001_audit_log_create_records.ts.example',
    ),
    'utf8',
  );
  await readFile(
    path.join(
      result.targetDirectory,
      'database/seeds/202608220002_audit_log_create_welcome_record.ts.example',
    ),
    'utf8',
  );
  await assert.rejects(
    readFile(
      path.join(
        result.targetDirectory,
        'database/migrations/202608220001_audit_log_create_records.ts',
      ),
      'utf8',
    ),
    { code: 'ENOENT' },
  );
  await readFile(
    path.join(result.targetDirectory, 'server/routes/index.ts'),
    'utf8',
  );
  await readFile(
    path.join(result.targetDirectory, 'tests/database.test.ts'),
    'utf8',
  );
  await readFile(
    path.join(result.targetDirectory, 'tests/routes.test.ts'),
    'utf8',
  );
});

test('does not overwrite an existing plugin directory', async (t) => {
  const repoRoot = await createTestRepo(t);
  const target = path.join(repoRoot, 'packages/app-plugin-existing');
  await mkdir(target);
  await writeFile(path.join(target, 'marker.txt'), 'keep\n');

  await assert.rejects(
    createPlugin({ install: false, name: 'existing', repoRoot }),
    /Target already exists/u,
  );
  assert.equal(
    await readFile(path.join(target, 'marker.txt'), 'utf8'),
    'keep\n',
  );
});

test('rejects names that cannot form safe package directories', async (t) => {
  const repoRoot = await createTestRepo(t);

  await assert.rejects(
    createPlugin({ install: false, name: '../escape', repoRoot }),
    /Plugin name must start/u,
  );
  await assert.rejects(
    createPlugin({ install: false, name: 'AuditLog', repoRoot }),
    /Plugin name must start/u,
  );
});

async function createTestRepo(t) {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-create-plugin-'),
  );
  await mkdir(path.join(repoRoot, 'packages'));
  t.after(() => rm(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}
