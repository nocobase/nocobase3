import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IDENTITY_SENSITIVE_PACKAGES,
  collectPackages,
  findApplicationViolations,
  findViolations,
  isIdentitySensitive,
} from '../../scripts/check-peer-deps.mjs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');

test('treats every plugin as identity sensitive', () => {
  assert.equal(
    isIdentitySensitive('@nocobase/app-plugin-authentication'),
    true,
  );
  assert.equal(
    isIdentitySensitive('@nocobase/app-plugin-anything-at-all'),
    true,
  );
});

test('treats packages carrying process-wide runtime state as identity sensitive', () => {
  for (const packageName of IDENTITY_SENSITIVE_PACKAGES.keys()) {
    assert.equal(isIdentitySensitive(packageName), true, packageName);
  }
});

test('leaves packages without a shared identity contract alone', () => {
  for (const packageName of [
    '@nocobase/drive',
    '@nocobase/logging',
    '@nocobase/session',
    '@nocobase/snowflake',
  ]) {
    assert.equal(isIdentitySensitive(packageName), false, packageName);
  }
});

test('covers database consumers, registries, cross-package errors and filter metadata', () => {
  for (const dependency of [
    '@nocobase/db',
    '@nocobase/caching',
    '@nocobase/authorization',
    '@nocobase/ai-employee',
    '@nocobase/repository-input',
  ]) {
    assert.equal(
      findViolations({
        name: '@nocobase/consumer',
        dependencies: { [dependency]: 'workspace:^' },
      }).length,
      1,
      dependency,
    );
    assert.equal(
      findViolations({
        name: '@nocobase/consumer',
        optionalDependencies: { [dependency]: 'workspace:^' },
      }).length,
      1,
      dependency,
    );
  }
});

test('requires production providers through transitive and cyclic peer chains', () => {
  const packages = new Map([
    [
      '@nocobase/app-server',
      {
        peerDependencies: { '@nocobase/queue': '^1.0.0' },
      },
    ],
    [
      '@nocobase/queue',
      {
        peerDependencies: { '@nocobase/db': '^1.0.0' },
      },
    ],
    [
      '@nocobase/db',
      {
        peerDependencies: { '@nocobase/queue': '^1.0.0' },
      },
    ],
  ]);
  const app = {
    dependencies: {
      '@nocobase/app-server': '^1.0.0',
      '@nocobase/queue': '^1.0.0',
    },
    devDependencies: { '@nocobase/db': '^1.0.0' },
  };
  assert.deepEqual(
    findApplicationViolations(app, packages).map((v) => v.dependency),
    ['@nocobase/db'],
  );
  app.dependencies['@nocobase/db'] = '^1.0.0';
  assert.deepEqual(findApplicationViolations(app, packages), []);
});

test('does not install client-only or optional peers into server deployments', () => {
  const packages = new Map([
    [
      '@nocobase/app-plugin-example',
      {
        peerDependencies: {
          '@nocobase/app-client': '^1.0.0',
          '@nocobase/app-portal-sdk': '^1.0.0',
          '@nocobase/ai-employee': '^1.0.0',
        },
        peerDependenciesMeta: { '@nocobase/ai-employee': { optional: true } },
      },
    ],
  ]);
  assert.deepEqual(
    findApplicationViolations(
      {
        dependencies: { '@nocobase/app-plugin-example': '^1.0.0' },
      },
      packages,
    ),
    [],
  );
});

test('reports an identity-sensitive package listed under dependencies', () => {
  const violations = findViolations({
    name: '@nocobase/app-plugin-example',
    dependencies: { '@nocobase/app-server': 'workspace:^' },
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, 'should-be-peer');
  assert.match(violations[0].message, /must be a peerDependency/u);
});

test('accepts an identity-sensitive package declared as a peer', () => {
  const violations = findViolations({
    name: '@nocobase/app-plugin-example',
    peerDependencies: { '@nocobase/app-server': 'workspace:^' },
  });

  assert.deepEqual(violations, []);
});

// A matching devDependency is neither required nor rejected. pnpm resolves a `workspace:^` peer to this
// repository's copy on its own, so the second declaration changed nothing and is no longer asked for.
test('accepts a workspace peer whether or not a devDependency accompanies it', () => {
  const withDev = findViolations({
    name: '@nocobase/app-plugin-example',
    peerDependencies: { '@nocobase/app-server': 'workspace:^' },
    devDependencies: { '@nocobase/app-server': 'workspace:*' },
  });

  assert.deepEqual(withDev, []);
});

test('accepts a third-party peer', () => {
  const violations = findViolations({
    name: '@nocobase/app-plugin-example',
    peerDependencies: { react: '^19.0.0' },
  });

  assert.deepEqual(violations, []);
});

// A plugin may depend on packages from its own scope, and self-reference through exports must not be reported.
test('ignores a package depending on itself', () => {
  const violations = findViolations({
    name: '@nocobase/app-plugin-example',
    dependencies: { '@nocobase/app-plugin-example': 'workspace:^' },
  });

  assert.deepEqual(violations, []);
});

test('every checked package in the repository satisfies the rule', async () => {
  const packages = await collectPackages(repoRoot);
  assert.ok(packages.length > 0, 'expected to discover packages');
  for (const name of [
    '@nocobase/authorization',
    '@nocobase/ai-employee',
    '@nocobase/queue',
    '@nocobase/app-server',
    '@nocobase/create-app',
  ]) {
    assert.ok(
      packages.some((p) => p.manifest.name === name),
      `missing coverage for ${name}`,
    );
  }

  for (const { manifest, manifestPath } of packages) {
    assert.deepEqual(
      findViolations(manifest),
      [],
      `${path.relative(repoRoot, manifestPath)} violates the peer dependency rule`,
    );
  }
});

test('all application templates provide the shared runtime when autoInstallPeers is disabled', async () => {
  const packages = await collectPackages(repoRoot);
  const byName = new Map(packages.map((p) => [p.manifest.name, p.manifest]));
  const templates = await collectPackages(repoRoot, ['templates']);
  assert.equal(templates.length, 3);
  for (const { manifest, manifestPath } of templates) {
    assert.deepEqual(
      findApplicationViolations(manifest, byName),
      [],
      manifestPath,
    );
    // Deleting a real provider must make the release check fail, including when a devDependency remains.
    const broken = structuredClone(manifest);
    broken.devDependencies['@nocobase/db'] =
      broken.dependencies['@nocobase/db'];
    delete broken.dependencies['@nocobase/db'];
    assert.ok(
      findApplicationViolations(broken, byName).some(
        (v) => v.dependency === '@nocobase/db',
      ),
      manifestPath,
    );
  }
});
