import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const libraryRoot = path.resolve(import.meta.dirname, '../../packages/libs');
const manifests = new Map(
  readdirSync(libraryRoot)
    .filter((name) => name === 'db' || name.startsWith('db-'))
    .map((name) => {
      const manifest = JSON.parse(
        readFileSync(path.join(libraryRoot, name, 'package.json'), 'utf8'),
      );
      return [manifest.name, manifest];
    }),
);
const dependencyFields = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
];

test('the database core and testkit never depend on their dialect consumers', () => {
  for (const name of ['@nocobase/db', '@nocobase/db-testkit']) {
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(manifests.get(name)[field] ?? {})) {
        assert.ok(
          !dependency.startsWith('@nocobase/db-'),
          `${name} ${field} must not depend on ${dependency}`,
        );
      }
    }
  }
});

test('database workspace dependencies are acyclic, including development and peers', () => {
  const visited = new Set();
  function visit(name, trail = []) {
    assert.ok(
      !trail.includes(name),
      `Dependency cycle: ${[...trail, name].join(' -> ')}`,
    );
    if (visited.has(name)) return;
    const manifest = manifests.get(name);
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(manifest[field] ?? {})) {
        if (manifests.has(dependency)) visit(dependency, [...trail, name]);
      }
    }
    visited.add(name);
  }
  for (const name of manifests.keys()) visit(name);
});
