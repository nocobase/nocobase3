import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const libraryRoot = path.join(repoRoot, 'ui-library');
const templates = ['default', 'examples', 'hub'];

// The UI Library items every template preinstalls under `client/extensions/nocobase-<item>/`. The library is the
// source of truth, so each template ships exactly what `shadcn add` would install today, plus the item's README; a
// change to an item is carried into all three templates in the same pull request. `auth-ui` is not listed: its
// template copies diverged from the library before this check existed and are due to be removed.
const preinstalled = [
  { group: 'page', item: 'page-ui' },
  { group: 'page', item: 'route-overlay-ui' },
];

function registryItem(group, name) {
  const registry = JSON.parse(
    fs.readFileSync(
      path.join(libraryRoot, 'registry', group, 'registry.json'),
      'utf8',
    ),
  );
  const item = registry.items.find((candidate) => candidate.name === name);
  assert.ok(item, `ui-library/registry/${group} must declare ${name}`);
  return item;
}

function filesIn(directory) {
  return fs
    .readdirSync(directory, { recursive: true })
    .filter((entry) => fs.statSync(path.join(directory, entry)).isFile())
    .map((entry) => entry.split(path.sep).join('/'))
    .sort();
}

for (const kind of templates) {
  const templateRoot = path.join(
    repoRoot,
    'packages/templates',
    `app-template-${kind}`,
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(templateRoot, 'package.json'), 'utf8'),
  );

  for (const { group, item: name } of preinstalled) {
    test(`${kind} ships the current ${name} from the UI Library`, () => {
      const item = registryItem(group, name);
      const itemRoot = `client/extensions/nocobase-${name}`;
      const expected = new Map([
        [
          'README.md',
          path.join(libraryRoot, 'registry', group, name, 'README.md'),
        ],
      ]);
      for (const file of item.files) {
        assert.ok(
          file.target.startsWith(`${itemRoot}/`),
          `${name}: ${file.target} must install under ${itemRoot}/`,
        );
        expected.set(
          file.target.slice(itemRoot.length + 1),
          path.join(libraryRoot, 'registry', group, file.path),
        );
      }

      // Both directions, so a file the item dropped or renamed does not linger in the template.
      const installedRoot = path.join(templateRoot, itemRoot);
      assert.deepEqual(filesIn(installedRoot), [...expected.keys()].sort());
      for (const [relative, source] of expected) {
        assert.equal(
          fs.readFileSync(path.join(installedRoot, relative), 'utf8'),
          fs.readFileSync(source, 'utf8'),
          `${kind}: refresh ${itemRoot}/${relative} from the UI Library`,
        );
      }

      for (const primitive of item.registryDependencies ?? []) {
        assert.ok(
          fs.existsSync(
            path.join(templateRoot, `client/components/ui/${primitive}.tsx`),
          ),
          `${kind}: ${name} needs the ${primitive} primitive`,
        );
      }
      for (const specifier of item.dependencies ?? []) {
        const dependency = specifier.slice(0, specifier.lastIndexOf('@'));
        assert.ok(
          manifest.dependencies?.[dependency] ??
            manifest.devDependencies?.[dependency],
          `${kind}: ${name} imports ${dependency}, which package.json must declare`,
        );
      }
    });
  }
}
