import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  deduplicateDependencyUpdates,
  extractChangelogSection,
  findPackageDirectories,
  fitReleaseNotes,
  parseAggregateTag,
  parsePackageTag,
  readPackagesFromTags,
  RELEASE_BODY_LIMIT,
  resolveDirectories,
} from '../../scripts/release-notes.mjs';

test('deduplicates dependency commits and preserves their dependency/version list', () => {
  const section = [
    '### Patch Changes',
    '',
    '- ceb356b: First fix.',
    '- ceb356b: A different fix from the same commit.',
    '- Updated dependencies [ceb356b]',
    '- Updated dependencies [c960d07]',
    '- Updated dependencies [ceb356b]',
    '- Updated dependencies [c960d07]',
    '  - @example/alpha@1.0.0',
    '  - @example/beta@2.0.0',
  ];
  const expected = [
    ...section.slice(0, 4),
    '- Updated dependencies [ceb356b], [c960d07]',
    ...section.slice(8),
  ].join('\n');
  assert.equal(deduplicateDependencyUpdates(section.join('\n')), expected);
  assert.equal(deduplicateDependencyUpdates(expected), expected);
});

test('handles a dependency run at the end and keeps deduplication local to each section', () => {
  const section =
    '- Updated dependencies [ceb356b]\n- Updated dependencies [ceb356b]';
  for (const heading of ['## Alpha', '## Beta']) {
    assert.equal(
      deduplicateDependencyUpdates(`${heading}\n\n${section}`),
      `${heading}\n\n- Updated dependencies [ceb356b]`,
    );
  }
});

test('preserves code examples, ordinary changes and nested dependency entries', () => {
  for (const fence of ['```', '~~~~']) {
    const section = [
      '- A change.',
      '- A change.',
      `${fence}markdown`,
      '- Updated dependencies [ceb356b]',
      '- Updated dependencies [ceb356b]',
      fence,
      '  - Updated dependencies [ceb356b]',
      '  - Updated dependencies [ceb356b]',
      '',
    ].join('\n');
    assert.equal(deduplicateDependencyUpdates(section), section);
  }
});

test('preserves notes exactly at the body limit, including the final newline', () => {
  const header = 'Packages';
  const full = 'x'.repeat(RELEASE_BODY_LIMIT - header.length - 3);
  assert.equal(
    fitReleaseNotes(header, [{ full, compact: 'Changelog link' }]),
    `${header}\n\n${full}\n`,
  );
});

test('replaces whole long sections with links while preserving order and small entries', () => {
  const header = '| Package | Version |\n| --- | --- |\n| alpha | 1 |';
  const small = '## Small\n\n- Keep this fix.';
  const link = '## Large\n\n[Full changelog](https://example.com/changelog)';
  const notes = fitReleaseNotes(header, [
    { full: small, compact: 'Small link' },
    {
      full: `## Large\n\n\`\`\`\n${'修复😀'.repeat(40_000)}\n\`\`\``,
      compact: link,
    },
    { full: '## Last\n\n- Keep this too.', compact: 'Last link' },
  ]);
  assert.ok(notes.length <= RELEASE_BODY_LIMIT);
  assert.ok(notes.startsWith(header));
  assert.match(notes, /Some long package entries/u);
  assert.ok(
    notes.endsWith(`${small}\n\n${link}\n\n## Last\n\n- Keep this too.\n`),
  );
  assert.ok(!notes.includes('```'));
});

test('compacts multiple entries when one replacement is insufficient', () => {
  const sections = Array.from({ length: 4 }, (_, index) => ({
    full: `## ${index}\n\n${'x'.repeat(60_000)}`,
    compact: `## ${index}\n\nChangelog link ${index}`,
  }));
  const notes = fitReleaseNotes('Packages', sections);
  assert.ok(notes.length <= RELEASE_BODY_LIMIT);
  assert.equal(notes.match(/Changelog link/gu)?.length, 3);
  assert.ok(notes.includes(sections[3].full));
});

test('includes the compaction notice in the length budget', () => {
  const full = 'x'.repeat(RELEASE_BODY_LIMIT);
  assert.throws(
    () => fitReleaseNotes('Packages', [{ full, compact: full.slice(0, -20) }]),
    /even with compact changelog links/u,
  );
});

test('fails clearly when even the package summary cannot fit', () => {
  assert.throws(
    () =>
      fitReleaseNotes('x'.repeat(RELEASE_BODY_LIMIT), [
        { full: 'abc', compact: 'a' },
      ]),
    /even with compact changelog links/u,
  );
});

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

// `packages/` was flat before it was regrouped into `packages/<category>/<package>`, and release notes still get
// rendered from tags cut in either era. A resolver hard-coded to one depth returns an empty map for the other, which
// does not fail — every package just renders as "no changelog entry". These two cases pin both layouts down.
for (const { label, manifests } of [
  {
    label: 'flat',
    manifests: {
      'app-database/package.json': '@nocobase/db',
      'app-template-default/package.json': '@nocobase/app-template-default',
    },
  },
  {
    label: 'grouped',
    manifests: {
      'libs/db/package.json': '@nocobase/db',
      'templates/app-template-default/package.json':
        '@nocobase/app-template-default',
    },
  },
]) {
  test(`resolves package directories from a ${label} tagged tree`, (t) => {
    const { commit, repository } = createTaggedRepository(t, manifests);
    const directories = Object.keys(manifests).map((file) =>
      file.slice(0, -'/package.json'.length),
    );

    assert.deepEqual(
      findPackageDirectories(commit, { cwd: repository }).sort(),
      [...directories].sort(),
    );
    const byName = resolveDirectories(
      commit,
      findPackageDirectories(commit, { cwd: repository }),
      { cwd: repository },
    );

    assert.deepEqual(
      [...byName].sort(([left], [right]) => left.localeCompare(right)),
      [
        ['@nocobase/app-template-default', directories[1]],
        ['@nocobase/db', directories[0]],
      ],
    );
  });
}

// A manifest nested inside a package is never a published package of its own — app-host ships five under
// `fixtures/app-dist/`. It must not displace the package that contains it. `zz-` makes the nested path sort after its
// parent, which is the order that actually breaks a last-writer-wins map; the real fixtures happen to sort the other
// way, so a test using their names would pass even against a resolver that shadows.
test('drops manifests nested inside a package', (t) => {
  const { commit, repository } = createTaggedRepository(t, {
    'app/app-host/package.json': '@nocobase/app-host',
    'app/app-host/zz-fixtures/demo/package.json': '@example/demo-app',
  });

  assert.deepEqual(findPackageDirectories(commit, { cwd: repository }), [
    'app/app-host',
  ]);

  const byName = resolveDirectories(
    commit,
    findPackageDirectories(commit, { cwd: repository }),
    { cwd: repository },
  );

  assert.equal(byName.get('@nocobase/app-host'), 'app/app-host');
  assert.equal(byName.has('@example/demo-app'), false);
});

// Returning an empty list here would make every package render "_No changelog entry_" under a green workflow, so an
// unreadable tree has to be an error rather than an empty result.
test('throws when the tagged tree cannot be listed', (t) => {
  const { repository } = createTaggedRepository(t, {
    'libs/alpha/package.json': '@nocobase/alpha',
  });

  assert.throws(
    () =>
      findPackageDirectories('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', {
        cwd: repository,
      }),
    /could not be listed/u,
  );
});

function createTaggedRepository(t, manifests) {
  const repository = mkdtempSync(
    path.join(tmpdir(), 'nocobase-release-notes-'),
  );
  t.after(() => rmSync(repository, { force: true, recursive: true }));

  const git = (...args) =>
    execFileSync('git', args, { cwd: repository, encoding: 'utf8' });

  git('init', '--quiet');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');

  for (const [file, name] of Object.entries(manifests)) {
    const target = path.join(repository, 'packages', file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify({ name, version: '1.0.0' })}\n`);
  }

  git('add', '--all');
  git('commit', '--quiet', '--message', 'release');

  return { commit: git('rev-parse', 'HEAD').trim(), repository };
}
