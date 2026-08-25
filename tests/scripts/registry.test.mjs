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

test('keeps the preinstalled Files Registry snapshot aligned with its plugin recipe', () => {
  const recipeRoot = path.join(filesOwnerRoot, 'registry/file-upload');
  const preinstalledRoot = path.join(
    repoRoot,
    'packages/app-template-default/client/extensions/nocobase-file-upload',
  );
  const recipeFiles = walkFiles(recipeRoot);

  assert.deepEqual(walkFiles(preinstalledRoot), recipeFiles);
  for (const file of recipeFiles) {
    assert.equal(
      fs.readFileSync(path.join(preinstalledRoot, file), 'utf8'),
      fs.readFileSync(path.join(recipeRoot, file), 'utf8'),
    );
  }
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
