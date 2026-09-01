import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IDENTITY_SENSITIVE_PACKAGES,
  collectPackages,
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

// Libraries that only export classes and factories hold no state a second copy could split, so requiring a peer range
// for them would add ceremony without preventing anything.
test('leaves stateless libraries alone', () => {
  for (const packageName of [
    '@nocobase/drive',
    '@nocobase/caching',
    '@nocobase/logging',
    '@nocobase/session',
    '@nocobase/snowflake',
  ]) {
    assert.equal(isIdentitySensitive(packageName), false, packageName);
  }
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

test('accepts an identity-sensitive package declared as a peer with a matching devDependency', () => {
  const violations = findViolations({
    name: '@nocobase/app-plugin-example',
    peerDependencies: { '@nocobase/app-server': 'workspace:^' },
    devDependencies: { '@nocobase/app-server': 'workspace:*' },
  });

  assert.deepEqual(violations, []);
});

// Without the devDependency the package resolves nothing when it is typechecked or tested on its own.
test('reports a workspace peer that has no devDependency', () => {
  const violations = findViolations({
    name: '@nocobase/app-plugin-example',
    peerDependencies: { '@nocobase/app-server': 'workspace:^' },
  });

  assert.equal(violations.length, 1);
  assert.equal(violations[0].kind, 'missing-dev');
});

// Third-party peers such as react usually resolve through another dependency, so demanding a direct devDependency for
// each one would report noise rather than a defect.
test('does not demand a devDependency for third-party peers', () => {
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

  for (const { manifest, manifestPath } of packages) {
    assert.deepEqual(
      findViolations(manifest),
      [],
      `${path.relative(repoRoot, manifestPath)} violates the peer dependency rule`,
    );
  }
});
