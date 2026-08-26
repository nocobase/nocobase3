import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildRegistry,
  materializeRegistry,
  parseRegistryArgs,
  resolveRegistryOwner,
} from '../../scripts/registry.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const ownerRoot = path.join(repoRoot, 'packages/app-plugin-authentication');
const filesOwnerRoot = path.join(repoRoot, 'packages/app-plugin-files');
const exampleOwnerRoot = path.join(
  repoRoot,
  'packages/app-plugin-registry-example',
);
const requireFromPortalSdk = createRequire(
  path.join(repoRoot, 'packages/app-portal-sdk/package.json'),
);
const semver = requireFromPortalSdk('semver');

test('parses package-scoped Registry commands', () => {
  assert.deepEqual(
    parseRegistryArgs([
      'materialize',
      '--package',
      '@nocobase/app-plugin-authentication',
      '--item',
      'auth-ui',
      '--output-root',
      'packages/app-template-default',
    ]),
    {
      action: 'materialize',
      all: false,
      help: false,
      item: 'auth-ui',
      outputRoot: 'packages/app-template-default',
      package: '@nocobase/app-plugin-authentication',
    },
  );
});

test('resolves a Registry owner by package name', () => {
  assert.equal(
    resolveRegistryOwner('@nocobase/app-plugin-authentication', { repoRoot }),
    ownerRoot,
  );
});

test('builds an installable Registry item with embedded source', async (t) => {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-registry-build-'),
  );
  t.after(() => rm(temporaryRoot, { force: true, recursive: true }));

  const result = buildRegistry({
    ownerRoot,
    outputDirectory: temporaryRoot,
    repoRoot,
  });
  const item = JSON.parse(
    fs.readFileSync(path.join(temporaryRoot, 'auth-ui.json'), 'utf8'),
  );

  assert.deepEqual(result.items, [{ files: 14, name: 'auth-ui' }]);
  assert.equal(item.name, 'auth-ui');
  assert.equal(item.files.length, 14);
  assert.equal(
    item.files.find(({ target }) => target.endsWith('/extension.ts')).path,
    'registry/auth-ui/extension.ts',
  );
  assert.match(
    item.files.find(({ target }) => target.endsWith('/extension.ts')).content,
    /defineClientSourceExtension/u,
  );
  assert.equal(Object.hasOwn(item, 'source'), false);
});

test('materializes the authentication recipe without overwriting it', async (t) => {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-registry-materialize-'),
  );
  t.after(() => rm(temporaryRoot, { force: true, recursive: true }));

  const result = materializeRegistry({
    item: 'auth-ui',
    outputRoot: temporaryRoot,
    ownerRoot,
    repoRoot,
  });
  const installedRoot = path.join(
    temporaryRoot,
    'client/extensions/nocobase-auth-ui',
  );
  const recipeRoot = path.join(ownerRoot, 'registry/auth-ui');
  const preinstalledRoot = path.join(
    repoRoot,
    'packages/app-template-default/client/extensions/nocobase-auth-ui',
  );
  const recipeFiles = walkFiles(recipeRoot);

  assert.deepEqual(result.materialized, [
    { files: 14, target: 'client/extensions/nocobase-auth-ui' },
  ]);
  assert.deepEqual(walkFiles(installedRoot), recipeFiles);
  assert.deepEqual(walkFiles(preinstalledRoot), recipeFiles);
  for (const file of recipeFiles) {
    const recipe = fs.readFileSync(path.join(recipeRoot, file), 'utf8');
    assert.equal(
      fs.readFileSync(path.join(installedRoot, file), 'utf8'),
      recipe,
    );
    assert.equal(
      fs.readFileSync(path.join(preinstalledRoot, file), 'utf8'),
      recipe,
    );
  }
  assert.throws(
    () =>
      materializeRegistry({
        item: 'auth-ui',
        outputRoot: temporaryRoot,
        ownerRoot,
        repoRoot,
      }),
    /Registry target already exists/u,
  );
});

test('builds and materializes the Files Registry without a Template snapshot', async (t) => {
  const buildRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-files-registry-build-'),
  );
  const applicationRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-files-registry-materialize-'),
  );
  t.after(() => rm(buildRoot, { force: true, recursive: true }));
  t.after(() => rm(applicationRoot, { force: true, recursive: true }));

  const items = [
    {
      name: 'page-ui',
      root: 'registry/page-ui',
      target: 'client/extensions/nocobase-files-page-ui',
    },
    {
      name: 'component-ui',
      root: 'registry/component-ui',
      target: 'client/extensions/nocobase-files-component-ui',
    },
    {
      name: 'provider-ui',
      root: 'registry/provider-ui',
      target: 'client/extensions/nocobase-files-provider-ui',
    },
  ].map((item) => ({
    ...item,
    files: walkFiles(path.join(filesOwnerRoot, item.root)),
  }));

  const buildResult = buildRegistry({
    ownerRoot: filesOwnerRoot,
    outputDirectory: buildRoot,
    repoRoot,
  });
  assert.deepEqual(
    buildResult.items,
    items.map(({ files, name }) => ({ files: files.length, name })),
  );
  assert.deepEqual(
    fs
      .readdirSync(buildRoot)
      .filter((file) => file.endsWith('.json'))
      .sort(),
    ['component-ui.json', 'page-ui.json', 'provider-ui.json', 'registry.json'],
  );
  const pageItem = JSON.parse(
    fs.readFileSync(path.join(buildRoot, 'page-ui.json'), 'utf8'),
  );
  const componentItem = JSON.parse(
    fs.readFileSync(path.join(buildRoot, 'component-ui.json'), 'utf8'),
  );
  const providerItem = JSON.parse(
    fs.readFileSync(path.join(buildRoot, 'provider-ui.json'), 'utf8'),
  );
  for (const item of [pageItem, componentItem]) {
    const dependency = item.dependencies.find((value) =>
      value.startsWith('@nocobase/app-plugin-files@'),
    );
    assert.equal(typeof dependency, 'string');
    const range = dependency.slice('@nocobase/app-plugin-files@'.length);
    assert.equal(semver.satisfies('0.0.1-beta.0', range), true);
    assert.equal(semver.satisfies('0.0.1-beta.1', range), true);
    assert.equal(
      item.registryDependencies.includes('@nocobase-files/provider-ui'),
      true,
    );
  }
  assert.equal(
    providerItem.dependencies.some((value) =>
      value.startsWith('@nocobase/app-sdk@'),
    ),
    true,
  );

  const materializeResult = materializeRegistry({
    ownerRoot: filesOwnerRoot,
    outputRoot: applicationRoot,
    repoRoot,
  });
  assert.deepEqual(
    materializeResult.materialized,
    items.map(({ files, target }) => ({ files: files.length, target })),
  );
  for (const item of items) {
    assert.deepEqual(
      walkFiles(path.join(applicationRoot, item.target)),
      item.files,
    );
    assert.equal(
      fs.existsSync(
        path.join(repoRoot, 'packages/app-template-default', item.target),
      ),
      false,
    );
  }
  const pageSource = fs.readFileSync(
    path.join(applicationRoot, items[0].target, 'extension.ts'),
    'utf8',
  );
  assert.match(pageSource, /FILES_ROUTE_IDS\.index/u);
  assert.doesNotMatch(pageSource, /path:\s*['"]\/files/u);
  assert.doesNotMatch(pageSource, /auth:\s*/u);
  assert.doesNotMatch(pageSource, /name:\s*['"]index/u);
  const installedPage = fs.readFileSync(
    path.join(applicationRoot, items[0].target, 'pages/files-page.tsx'),
    'utf8',
  );
  assert.match(installedPage, /from '@\/components\/ui\/button'/u);
  assert.doesNotMatch(installedPage, /client\/default-pages/u);
  assert.doesNotMatch(installedPage, /client\/components\/ui/u);
  assert.match(
    fs.readFileSync(
      path.join(applicationRoot, items[1].target, 'index.ts'),
      'utf8',
    ),
    /FileUploadField/u,
  );
  assert.match(
    fs.readFileSync(
      path.join(applicationRoot, items[2].target, 'index.ts'),
      'utf8',
    ),
    /FilesUiProvider/u,
  );
  assert.equal(
    fs.existsSync(path.join(filesOwnerRoot, 'registry/file-upload')),
    false,
  );
});

test('does not publish the legacy Hub file-upload protocol', () => {
  const hubRoot = path.join(repoRoot, 'packages/hub');
  const hubConfig = JSON.parse(
    fs.readFileSync(path.join(hubRoot, 'registry.config.json'), 'utf8'),
  );
  assert.equal(
    hubConfig.items.some(({ name }) => name === 'file-upload'),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(hubRoot, 'registry/nocobase-file-upload')),
    false,
  );

  const legacyContracts = [
    'FileFieldDescriptor',
    'NocoBaseFileRecord',
    'storages:check',
    'upload-direct',
    'upload-multipart',
    'dataSourceKey',
  ];
  const hubRegistrySource = fs.readFileSync(
    path.join(hubRoot, 'registry.config.json'),
    'utf8',
  );
  for (const contract of legacyContracts) {
    assert.doesNotMatch(hubRegistrySource, new RegExp(contract, 'u'));
  }
});

test('builds and materializes the plugin Registry example', async (t) => {
  const buildRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-registry-example-build-'),
  );
  const applicationRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-registry-example-app-'),
  );
  t.after(() => rm(buildRoot, { force: true, recursive: true }));
  t.after(() => rm(applicationRoot, { force: true, recursive: true }));

  const buildResult = buildRegistry({
    ownerRoot: exampleOwnerRoot,
    outputDirectory: buildRoot,
    repoRoot,
  });
  const pageItem = JSON.parse(
    fs.readFileSync(path.join(buildRoot, 'page-ui.json'), 'utf8'),
  );

  assert.deepEqual(buildResult.items, [
    { files: 3, name: 'page-ui' },
    { files: 3, name: 'component-ui' },
    { files: 4, name: 'provider-ui' },
  ]);
  assert.deepEqual(pageItem.registryDependencies, ['button']);
  assert.equal(pageItem.files.length, 3);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(buildRoot, 'component-ui.json'), 'utf8'),
    ).files.length,
    3,
  );
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(buildRoot, 'provider-ui.json'), 'utf8'),
    ).files.length,
    4,
  );

  const materializeResult = materializeRegistry({
    outputRoot: applicationRoot,
    ownerRoot: exampleOwnerRoot,
    repoRoot,
  });
  const installedRoot = path.join(
    applicationRoot,
    'client/extensions/nocobase-registry-example-page-ui',
  );

  assert.deepEqual(materializeResult.materialized, [
    {
      files: 3,
      target: 'client/extensions/nocobase-registry-example-page-ui',
    },
    {
      files: 3,
      target: 'client/extensions/nocobase-registry-example-component-ui',
    },
    {
      files: 4,
      target: 'client/extensions/nocobase-registry-example-provider-ui',
    },
  ]);
  assert.match(
    fs.readFileSync(
      path.join(installedRoot, 'pages/registry-example-page.tsx'),
      'utf8',
    ),
    /from '@\/components\/ui\/button'/u,
  );
  assert.match(
    fs.readFileSync(path.join(installedRoot, 'extension.ts'), 'utf8'),
    /REGISTRY_EXAMPLE_ROUTE_IDS\.index/u,
  );
  assert.match(
    fs.readFileSync(
      path.join(
        applicationRoot,
        'client/extensions/nocobase-registry-example-component-ui/index.ts',
      ),
      'utf8',
    ),
    /EditablePanel/u,
  );
  assert.match(
    fs.readFileSync(
      path.join(
        applicationRoot,
        'client/extensions/nocobase-registry-example-provider-ui/index.ts',
      ),
      'utf8',
    ),
    /ExampleUiProvider/u,
  );
});

function walkFiles(directory, root = directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? walkFiles(entryPath, root)
        : [path.relative(root, entryPath).split(path.sep).join('/')];
    })
    .sort((left, right) => left.localeCompare(right));
}
