import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractChangelogSection,
  parseAggregateTag,
  parsePackageTag,
  readPackagesFromTags,
} from '../../scripts/release-notes.mjs';

test('parses beta and stable aggregate tags', () => {
  assert.deepEqual(parseAggregateTag('release-beta/2026-08-26.5'), {
    batch: '2026-08-26.5',
    channel: 'beta',
  });
  assert.deepEqual(parseAggregateTag('release/2026-08-27.1'), {
    batch: '2026-08-27.1',
    channel: 'stable',
  });
});

test('rejects tags that are not aggregate release tags', () => {
  for (const tag of [
    '@nocobase/create-app@0.1.0-beta.4',
    'release-beta/2026-08-26',
    'v1.0.0',
    'release/not-a-date.1',
  ]) {
    assert.throws(
      () => parseAggregateTag(tag),
      /Not an aggregate release tag/u,
    );
  }
});

// Scoped package names contain their own `@`, so only the last one separates
// the version. Splitting on the first would yield an empty name.
test('splits scoped package tags on the final @', () => {
  assert.deepEqual(parsePackageTag('@nocobase/create-app@0.1.0-beta.4'), {
    name: '@nocobase/create-app',
    version: '0.1.0-beta.4',
  });
  assert.deepEqual(parsePackageTag('unscoped@1.2.3'), {
    name: 'unscoped',
    version: '1.2.3',
  });
});

test('ignores tags that are not package tags', () => {
  assert.equal(parsePackageTag('release-beta/2026-08-26.5'), undefined);
  assert.equal(parsePackageTag('@nocobase/create-app'), undefined);
  assert.equal(parsePackageTag('@scope@notaversion'), undefined);
});

test('keeps only package tags, sorted by name', () => {
  assert.deepEqual(
    readPackagesFromTags([
      'release-beta/2026-08-26.4',
      '@nocobase/hub@0.0.1-beta.3',
      '@nocobase/app-template-default@0.0.1-beta.5',
      '@nocobase/create-app@0.1.0-beta.3',
    ]),
    [
      { name: '@nocobase/app-template-default', version: '0.0.1-beta.5' },
      { name: '@nocobase/create-app', version: '0.1.0-beta.3' },
      { name: '@nocobase/hub', version: '0.0.1-beta.3' },
    ],
  );
});

test('extracts one changelog section without prefix collisions', () => {
  const changelog = `# @nocobase/alpha

## 1.0.0-beta.10

Ten.

## 1.0.0-beta.1

One.

## 1.0.0

### Patch Changes

- Stable.
`;
  assert.equal(extractChangelogSection(changelog, '1.0.0-beta.1'), 'One.');
  assert.equal(extractChangelogSection(changelog, '1.0.0-beta.10'), 'Ten.');
  assert.equal(
    extractChangelogSection(changelog, '1.0.0'),
    '### Patch Changes\n\n- Stable.',
  );
});

test('returns undefined when the version has no changelog section', () => {
  assert.equal(extractChangelogSection('# Package\n', '1.0.0'), undefined);
  assert.equal(
    extractChangelogSection(
      '# Package\n\n## 1.0.0\n\n## 0.9.0\n\nOld.\n',
      '1.0.0',
    ),
    undefined,
  );
});
