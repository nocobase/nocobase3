import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createReleaseManifest,
  extractChangelogSection,
  formatReleaseRecords,
  renderReleaseNotes,
  validateReleaseManifest,
  validateReleaseTree,
} from '../../scripts/release-manifest.mjs';

const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567';

test('creates a stable manifest from changed public packages only', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPackage(repoRoot, 'alpha', '@nocobase/alpha', '1.1.0');
  await createPackage(repoRoot, 'private', '@nocobase/private', '2.0.0', {
    privatePackage: true,
  });
  await createPackage(repoRoot, 'unchanged', '@nocobase/unchanged', '3.0.0');

  const manifest = createReleaseManifest({
    batch: '2026-08-27.1',
    beforeVersions: {
      '@nocobase/alpha': '1.0.0',
      '@nocobase/private': '1.0.0',
      '@nocobase/unchanged': '3.0.0',
    },
    channel: 'stable',
    distTag: 'latest',
    originRunId: '1234',
    releaseKind: 'stable-promotion',
    repoRoot,
    sourceSha: SOURCE_SHA,
    tag: 'release/2026-08-27.1',
    targetBranch: 'main',
  });

  assert.deepEqual(manifest.packages, [
    {
      directory: 'alpha',
      name: '@nocobase/alpha',
      version: '1.1.0',
    },
  ]);
});

test('rejects a manifest whose tag does not match its channel and batch', () => {
  const manifest = validManifest();
  manifest.tag = 'release/2026-08-27.1';
  assert.throws(
    () => validateReleaseManifest(manifest),
    /does not match channel and batch/u,
  );
});

test('rejects duplicate packages and unsafe package directories', () => {
  const duplicate = validManifest();
  duplicate.packages.push({ ...duplicate.packages[0] });
  assert.throws(() => validateReleaseManifest(duplicate), /Duplicate package/u);

  const unsafe = validManifest();
  unsafe.packages[0].directory = '../alpha';
  assert.throws(() => validateReleaseManifest(unsafe), /invalid directory/u);

  const parent = validManifest();
  parent.packages[0].directory = '..';
  assert.throws(() => validateReleaseManifest(parent), /invalid directory/u);
});

test('extracts an exact changelog version without prefix collisions', () => {
  const changelog = `# @nocobase/alpha

## 1.0.0-beta.1

Beta details.

## 1.0.0

### Patch Changes

- Stable details.

## 0.9.0

Old details.
`;

  assert.equal(
    extractChangelogSection(changelog, '1.0.0'),
    '### Patch Changes\n\n- Stable details.',
  );
  assert.equal(
    extractChangelogSection(changelog, '1.0.0-beta.1'),
    'Beta details.',
  );
});

test('requires exactly one matching changelog heading', () => {
  assert.throws(
    () => extractChangelogSection('# Package\n', '1.0.0'),
    /found 0/u,
  );
  assert.throws(
    () =>
      extractChangelogSection(
        '# Package\n\n## 1.0.0\n\nFirst\n\n## 1.0.0\n\nSecond\n',
        '1.0.0',
      ),
    /found 2/u,
  );
});

test('renders package tables and exact changelog sections', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPackage(repoRoot, 'alpha', '@nocobase/alpha', '1.0.0', {
    changelog: `# @nocobase/alpha

## 1.0.0

### Minor Changes

- Added the release flow.

## 0.9.0

- Old entry.
`,
  });
  const manifest = validManifest();
  const notes = renderReleaseNotes(manifest, repoRoot);

  assert.match(notes, /Beta release `2026-08-27\.1` publishes 1 package\./u);
  assert.match(notes, /\| `@nocobase\/alpha` \| `1\.0\.0` \|/u);
  assert.match(notes, /## `@nocobase\/alpha@1\.0\.0`/u);
  assert.match(notes, /Added the release flow\./u);
  assert.doesNotMatch(notes, /Old entry/u);
  assert.equal(formatReleaseRecords(manifest), '@nocobase/alpha\t1.0.0\n');
});

test('rejects a package list that is incomplete for the release tree', async (t) => {
  const repoRoot = await createTestRepo(t);
  await createPackage(repoRoot, 'alpha', '@nocobase/alpha', '1.0.0');
  await createPackage(repoRoot, 'beta', '@nocobase/beta', '2.0.0');
  const manifest = validManifest();

  assert.throws(
    () =>
      validateReleaseTree(manifest, repoRoot, {
        '@nocobase/alpha': '0.9.0',
        '@nocobase/beta': '1.0.0',
      }),
    /do not match the version changes/u,
  );
});

function validManifest() {
  return {
    schemaVersion: 1,
    channel: 'beta',
    releaseKind: 'beta',
    batch: '2026-08-27.1',
    tag: 'release-beta/2026-08-27.1',
    targetBranch: 'develop',
    distTag: 'beta',
    sourceSha: SOURCE_SHA,
    originRunId: '1234',
    packages: [
      {
        directory: 'alpha',
        name: '@nocobase/alpha',
        version: '1.0.0',
      },
    ],
  };
}

async function createTestRepo(t) {
  const repoRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-release-manifest-test-'),
  );
  await mkdir(path.join(repoRoot, 'packages'));
  t.after(() => rm(repoRoot, { force: true, recursive: true }));
  return repoRoot;
}

async function createPackage(
  repoRoot,
  directory,
  name,
  version,
  { changelog, privatePackage = false } = {},
) {
  const packageDirectory = path.join(repoRoot, 'packages', directory);
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    `${JSON.stringify({ name, private: privatePackage, version }, null, 2)}\n`,
  );
  await writeFile(
    path.join(packageDirectory, 'CHANGELOG.md'),
    changelog ?? `# ${name}\n\n## ${version}\n\n- Released.\n`,
  );
}
