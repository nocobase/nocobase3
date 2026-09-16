import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../packages/templates');
const templates = ['default', 'examples', 'hub'].map((kind) => {
  const directory = path.join(root, `app-template-${kind}`);
  return {
    kind,
    directory,
    manifest: JSON.parse(
      readFileSync(path.join(directory, 'package.json'), 'utf8'),
    ),
  };
});
const [baseline] = templates;

function filesIn(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(prefix, entry.name);
      return entry.isDirectory()
        ? filesIn(path.join(directory, entry.name), relative)
        : [relative];
    })
    .sort();
}

// These are shared framework mechanisms, not product pages or plugin composition.
// Compare both directions so adding a build helper in only one template also fails.
for (const template of templates) {
  test(`${template.kind} keeps the shared build and CLI framework aligned with Default`, () => {
    for (const directory of [
      'scripts',
      'cli/dev-commands',
      'client/routing',
      'client/layouts',
      'client/theme',
    ]) {
      const expected = filesIn(path.join(baseline.directory, directory));
      assert.deepEqual(
        filesIn(path.join(template.directory, directory)),
        expected,
      );
      for (const file of expected) {
        const relative = path.join(directory, file);
        assert.equal(
          readFileSync(path.join(template.directory, relative), 'utf8'),
          readFileSync(path.join(baseline.directory, relative), 'utf8'),
          `${template.kind}: ${relative}`,
        );
      }
    }
    for (const file of [
      'tsconfig.json',
      'tsconfig.server.json',
      'eslint.config.js',
      'vitest.config.ts',
      'vite.config.ts',
      'server/app.ts',
      'server/embedded.ts',
      'server/standalone.ts',
      'client/shell/header-actions.tsx',
    ]) {
      assert.equal(
        readFileSync(path.join(template.directory, file), 'utf8'),
        readFileSync(path.join(baseline.directory, file), 'utf8'),
        `${template.kind}: ${file}`,
      );
    }
    // Product-specific scripts need a documented exception; compare the shared contract in both directions.
    const exceptions = [
      'pack:check', // Tarball names identify each template.
      ...(template.kind === 'hub' ? ['test:e2e'] : []), // Hub has no AI plugin.
    ];
    const sharedScripts = (scripts) =>
      Object.fromEntries(
        Object.entries(scripts).filter(([name]) => !exceptions.includes(name)),
      );
    assert.deepEqual(
      sharedScripts(template.manifest.scripts),
      sharedScripts(baseline.manifest.scripts),
      `${template.kind}: shared scripts`,
    );
  });

  test(`${template.kind} declares a single dependency category and the database runtime peer`, () => {
    const { dependencies, devDependencies } = template.manifest;
    const duplicates = Object.keys(dependencies).filter(
      (name) => name in devDependencies,
    );
    assert.deepEqual(duplicates, []);
    assert.ok(dependencies['@nocobase/db']);
    assert.ok(dependencies['@nocobase/db-sqlite']);
    for (const field of [
      'engines',
      'packageManager',
      'type',
      'prettier',
      'browserslist',
    ]) {
      assert.deepEqual(
        template.manifest[field],
        baseline.manifest[field],
        field,
      );
    }
    for (const [name, range] of Object.entries(devDependencies)) {
      const baselineRange = baseline.manifest.devDependencies[name];
      if (baselineRange) assert.equal(range, baselineRange, name);
    }
  });
}
