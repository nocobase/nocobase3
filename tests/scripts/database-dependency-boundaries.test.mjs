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
const officialDrivers = new Set([
  '@nocobase/db-sqlite',
  '@nocobase/db-mysql',
  '@nocobase/db-postgres',
  '@nocobase/db-mssql',
  '@nocobase/db-oracle',
  '@nocobase/db-dameng',
  '@nocobase/db-kingbase',
  '@nocobase/db-oceanbase',
]);

function isOfficialDriverPeer(name, field, dependency) {
  return (
    name === '@nocobase/db' &&
    field === 'peerDependencies' &&
    officialDrivers.has(dependency) &&
    manifests.get(name).peerDependenciesMeta?.[dependency]?.optional === true
  );
}

test('the database core declares official drivers only as optional peers', () => {
  const core = manifests.get('@nocobase/db');
  for (const driver of officialDrivers) {
    assert.ok(
      core.peerDependencies?.[driver],
      `Missing driver peer: ${driver}`,
    );
    assert.equal(core.peerDependenciesMeta?.[driver]?.optional, true);
  }
});

test('the database core and testkit forbid dialect dependencies except official optional core peers', () => {
  for (const name of ['@nocobase/db', '@nocobase/db-testkit']) {
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(manifests.get(name)[field] ?? {})) {
        if (isOfficialDriverPeer(name, field, dependency)) continue;
        assert.ok(
          !dependency.startsWith('@nocobase/db-'),
          `${name} ${field} must not depend on ${dependency}`,
        );
      }
    }
  }
});

test('database workspace dependencies are acyclic except official optional core peers', () => {
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
        // Drivers consume the core; its optional peers only resolve host-installed
        // drivers on demand. All other peer and development edges remain checked.
        if (isOfficialDriverPeer(name, field, dependency)) continue;
        if (manifests.has(dependency)) visit(dependency, [...trail, name]);
      }
    }
    visited.add(name);
  }
  for (const name of manifests.keys()) visit(name);
});
