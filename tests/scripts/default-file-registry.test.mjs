import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { materializeRegistry } from '../../scripts/registry.mjs';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const templateRoot = path.join(
  repoRoot,
  'packages/templates/app-template-default',
);
const ownerRoot = path.join(repoRoot, 'packages/plugins/app-plugin-file');

// This checks the shipped template, not applications customized after generation.
// A Registry change must update the default copy before the next template release.
test('Default ships the complete current File Registry with its client dependencies', async (t) => {
  const outputRoot = await mkdtemp(
    path.join(tmpdir(), 'default-file-registry-'),
  );
  t.after(() => rm(outputRoot, { recursive: true, force: true }));
  const { materialized } = materializeRegistry({
    ownerRoot,
    outputRoot,
    repoRoot,
    item: 'component-ui',
  });
  for (const { target } of materialized) {
    const expectedRoot = path.join(outputRoot, target);
    const installedRoot = path.join(templateRoot, target);
    const files = (root) =>
      fs
        .readdirSync(root, { recursive: true })
        .filter((entry) => fs.statSync(path.join(root, entry)).isFile())
        .sort();
    assert.deepEqual(files(installedRoot), files(expectedRoot));
    for (const file of files(expectedRoot)) {
      assert.equal(
        fs.readFileSync(path.join(installedRoot, file), 'utf8'),
        fs.readFileSync(path.join(expectedRoot, file), 'utf8'),
        `Refresh the Default File Registry copy: ${file}`,
      );
    }
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(templateRoot, 'package.json'), 'utf8'),
  );
  const registry = JSON.parse(
    fs.readFileSync(path.join(ownerRoot, 'registry.config.json'), 'utf8'),
  );
  const item = registry.items.find(({ name }) => name === 'component-ui');
  for (const specifier of item.dependencies) {
    const name = specifier.slice(0, specifier.lastIndexOf('@'));
    const section =
      name.startsWith('@nocobase/') && manifest.dependencies[name]
        ? 'dependencies'
        : 'devDependencies';
    assert.ok(
      manifest[section][name],
      `${name} must be declared in ${section}`,
    );
  }
  const viewer = item.dependencies.find((name) =>
    name.startsWith('@silurus/ooxml@'),
  );
  assert.equal(
    manifest.devDependencies['@silurus/ooxml'],
    viewer.slice('@silurus/ooxml@'.length),
  );
  assert.equal(manifest.dependencies['@silurus/ooxml'], undefined);
  for (const primitive of item.registryDependencies) {
    assert.ok(
      fs.existsSync(
        path.join(templateRoot, `client/components/ui/${primitive}.tsx`),
      ),
    );
  }
});
