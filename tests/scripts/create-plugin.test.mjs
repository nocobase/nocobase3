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
  assert.equal(packageJson.version, '0.0.1');
  assert.equal(packageJson.prettier, '@nocobase/dev-config/prettier');
  assert.deepEqual(packageJson.exports, {
    './client/module': {
      types: './client/module.ts',
      import: './client/module.ts',
    },
    './client/bootstrap': {
      types: './client/bootstrap.ts',
      import: './client/bootstrap.ts',
    },
    './client/routes': {
      types: './client/routes.ts',
      import: './client/routes.ts',
    },
    './client/providers': {
      types: './client/providers.ts',
      import: './client/providers.ts',
    },
    './package.json': './package.json',
  });
  assert.deepEqual(packageJson.publishConfig.exports, {
    './client/module': {
      types: './dist/client/module.d.ts',
      import: './dist/client/module.js',
    },
    './client/bootstrap': {
      types: './dist/client/bootstrap.d.ts',
      import: './dist/client/bootstrap.js',
    },
    './client/routes': {
      types: './dist/client/routes.d.ts',
      import: './dist/client/routes.js',
    },
    './client/providers': {
      types: './dist/client/providers.d.ts',
      import: './dist/client/providers.js',
    },
    './package.json': './package.json',
  });
  assert.ok(
    Array.isArray(packageJson.files),
    'the generated package must declare files',
  );
  assert.ok(packageJson.files.includes('dist'));
  assert.ok(
    packageJson.files.includes('.agents'),
    'plugin skills must ship with the package',
  );
  assert.deepEqual(packageJson.nocobase.plugin.client, {
    bootstrap: './client/bootstrap',
    routes: './client/routes',
    providers: './client/providers',
  });
  assert.deepEqual(packageJson.nocobase.plugin.database, {
    migrations: './database/migrations',
    seeds: './database/seeds',
  });
  assert.equal(
    packageJson.dependencies['@nocobase/app-database'],
    'workspace:^',
  );
  assert.equal(packageJson.dependencies.hono, 'catalog:');
  assert.equal(packageJson.peerDependencies['@nocobase/app-client'], '^0.1.0');
  assert.equal(packageJson.peerDependencies.react, '^19.0.0');
  assert.equal(
    packageJson.devDependencies['@nocobase/app-client'],
    'workspace:*',
  );
  assert.equal(packageJson.devDependencies['@types/react'], 'catalog:');
  assert.equal(packageJson.devDependencies.react, 'catalog:');
  assert.equal(
    tsconfig.extends,
    '@nocobase/dev-config/tsconfig/server-library.json',
  );
  assert.deepEqual(tsconfig.compilerOptions.lib, [
    'ES2022',
    'DOM',
    'DOM.Iterable',
  ]);
  assert.equal(tsconfig.compilerOptions.jsx, 'react-jsx');
  assert.deepEqual(tsconfig.include, [
    'database/**/*.ts',
    'server/**/*.ts',
    'client/**/*.ts',
    'client/**/*.tsx',
  ]);
  assert.equal(
    tsconfigContents,
    `{\n  "extends": "@nocobase/dev-config/tsconfig/server-library.json",\n  "compilerOptions": {\n    "jsx": "react-jsx",\n    "lib": ["ES2022", "DOM", "DOM.Iterable"],\n    "rootDir": ".",\n    "outDir": "dist"\n  },\n  "include": [\n    "database/**/*.ts",\n    "server/**/*.ts",\n    "client/**/*.ts",\n    "client/**/*.tsx"\n  ]\n}\n`,
  );
  await assert.rejects(
    readFile(path.join(result.targetDirectory, 'src/index.ts'), 'utf8'),
    { code: 'ENOENT' },
  );
  await readFile(
    path.join(result.targetDirectory, 'server/bootstrap.ts'),
    'utf8',
  );
  const clientModule = await readFile(
    path.join(result.targetDirectory, 'client/module.ts'),
    'utf8',
  );
  const clientBootstrap = await readFile(
    path.join(result.targetDirectory, 'client/bootstrap.ts'),
    'utf8',
  );
  const clientRoutes = await readFile(
    path.join(result.targetDirectory, 'client/routes.ts'),
    'utf8',
  );
  const clientProviders = await readFile(
    path.join(result.targetDirectory, 'client/providers.ts'),
    'utf8',
  );
  assert.match(clientModule, /defineClientModule\(\{/u);
  assert.match(
    clientModule,
    /packageName: '@nocobase\/app-plugin-audit-log',/u,
  );
  assert.match(
    clientModule,
    /bootstrap: \(\) => import\('\.\/bootstrap\.js'\),/u,
  );
  assert.match(clientModule, /routes: \(\) => import\('\.\/routes\.js'\),/u);
  assert.match(
    clientModule,
    /providers: \(\) => import\('\.\/providers\.js'\),/u,
  );
  assert.match(
    clientModule,
    /const auditLog: AppClientModuleFactory<AuditLogClientOptions> =/u,
  );
  assert.match(clientModule, /export default auditLog;/u);
  assert.match(clientBootstrap, /AppClientPluginBootstrap/u);
  assert.match(clientRoutes, /defineClientRoutes\(\[\]\)/u);
  assert.match(clientProviders, /defineClientProviders\(\s*\[\],\s*\)/u);
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
    path.join(result.targetDirectory, 'tests/client.test.ts'),
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
