import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
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

test('materializes local Registry dependencies for a selected item', async (t) => {
  const applicationRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-files-registry-dependency-'),
  );
  t.after(() => rm(applicationRoot, { force: true, recursive: true }));

  const result = materializeRegistry({
    item: 'component-ui',
    ownerRoot: filesOwnerRoot,
    outputRoot: applicationRoot,
    repoRoot,
  });

  assert.deepEqual(
    result.materialized.map(({ target }) => target),
    [
      'client/extensions/nocobase-files-provider-ui',
      'client/extensions/nocobase-files-component-ui',
    ],
  );
  assert.equal(
    fs.existsSync(
      path.join(
        applicationRoot,
        'client/extensions/nocobase-files-provider-ui/index.ts',
      ),
    ),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(
        applicationRoot,
        'client/extensions/nocobase-files-component-ui/index.ts',
      ),
    ),
    true,
  );
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
