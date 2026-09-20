import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

import { validateDistTag } from '../../scripts/prepare-release-pack.mjs';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const script = path.resolve(
  import.meta.dirname,
  '../../scripts/prepare-release-pack.mjs',
);

test('copies exact pack-check bytes into a native Changesets plan and preserves tag-only entries', async (t) => {
  const fixture = await createFixture(t);
  const originalPlan = {
    version: 1,
    generatedBy: 'fixture',
    plan: [
      [
        {
          kind: 'tag-only',
          name: '@nocobase/beta',
          version: '2.0.0',
          note: 'preserve this entry',
        },
      ],
      [
        {
          kind: 'publish',
          name: '@nocobase/alpha',
          version: '1.0.0',
          access: 'public',
          tag: 'latest',
          note: 'preserve this property',
        },
      ],
    ],
  };
  await writePlan(fixture.planPath, originalPlan);
  const sourceTarball = path.join(fixture.artifacts, 'nocobase-alpha.tgz');
  const sourceBytes = await readFile(sourceTarball);

  await runPrepare(fixture, ['--tag', 'legacy']);

  const preparedDocument = JSON.parse(await readFile(fixture.planPath, 'utf8'));
  assert.equal(preparedDocument.generatedBy, 'fixture');
  assert.deepEqual(preparedDocument.plan[0], originalPlan.plan[0]);
  const preparedRelease = preparedDocument.plan[1][0];
  assert.equal(preparedRelease.note, 'preserve this property');
  assert.equal(preparedRelease.tag, 'legacy');
  assert.deepEqual(preparedRelease.tarball, {
    integrity: `sha256-${createHash('sha256').update(sourceBytes).digest('base64')}`,
    path: 'packages/nocobase-alpha.tgz',
  });

  const copiedTarball = path.join(fixture.output, preparedRelease.tarball.path);
  assert.deepEqual(await readFile(copiedTarball), sourceBytes);
  assert.deepEqual(await readFile(sourceTarball), sourceBytes);
  assert.deepEqual(await readdir(path.join(fixture.output, 'packages')), [
    'nocobase-alpha.tgz',
  ]);

  // Exercise Changesets 3.0.1's own artifact-plan reader rather than only mirroring its JSON checks here.
  const cliManifest = require.resolve('@changesets/cli/package.json');
  const nativeModule = await import(
    pathToFileURL(
      path.join(path.dirname(cliManifest), 'dist/getPublishPlan.mjs'),
    ).href
  );
  assert.deepEqual(
    await nativeModule.n(fixture.planPath),
    preparedDocument.plan,
  );

  const planBeforeValidation = await readFile(fixture.planPath);
  const tarballBeforeValidation = await readFile(copiedTarball);
  await runValidate(fixture);
  assert.deepEqual(await readFile(fixture.planPath), planBeforeValidation);
  assert.deepEqual(await readFile(copiedTarball), tarballBeforeValidation);
});

test('refreshes a partially published plan using only previously verified tarballs', async (t) => {
  const fixture = await createFixture(t);
  await createArchive(
    path.join(fixture.artifacts, 'nocobase-beta.tgz'),
    manifest('@nocobase/beta', '2.0.0'),
    fixture.root,
  );
  await writePlan(fixture.planPath, {
    version: 1,
    plan: [
      [
        {
          kind: 'publish',
          name: '@nocobase/alpha',
          version: '1.0.0',
          access: 'public',
          tag: 'latest',
        },
        {
          kind: 'publish',
          name: '@nocobase/beta',
          version: '2.0.0',
          access: 'public',
          tag: 'latest',
        },
      ],
    ],
  });
  await runPrepare(fixture);
  const originalPlan = await readFile(fixture.planPath);
  const betaBytes = await readFile(
    path.join(fixture.output, 'packages/nocobase-beta.tgz'),
  );
  const refreshed = {
    ...fixture,
    artifacts: path.join(fixture.output, 'packages'),
    output: path.join(fixture.root, 'release-publish'),
    planPath: path.join(fixture.root, 'release-publish/publish-plan.json'),
  };
  await mkdir(refreshed.output);
  await writePlan(refreshed.planPath, {
    version: 1,
    plan: [
      [
        { kind: 'tag-only', name: '@nocobase/alpha', version: '1.0.0' },
        {
          kind: 'publish',
          name: '@nocobase/beta',
          version: '2.0.0',
          access: 'public',
          tag: 'latest',
        },
      ],
    ],
  });
  await runPrepare(refreshed, ['--tag', 'legacy']);
  await runValidate(refreshed);
  assert.deepEqual(await readdir(path.join(refreshed.output, 'packages')), [
    'nocobase-beta.tgz',
  ]);
  assert.deepEqual(
    await readFile(path.join(refreshed.output, 'packages/nocobase-beta.tgz')),
    betaBytes,
  );
  assert.deepEqual(await readFile(fixture.planPath), originalPlan);
  const retriedPlan = JSON.parse(await readFile(refreshed.planPath, 'utf8'));
  assert.equal(retriedPlan.plan[0][0].kind, 'tag-only');
  assert.equal(retriedPlan.plan[0][1].tag, 'legacy');
});

test('accepts safe non-version dist-tags and rejects version-like or unsafe tags', () => {
  assert.equal(validateDistTag('legacy'), 'legacy');
  assert.equal(validateDistTag('hotfix-2026.09'), 'hotfix-2026.09');
  for (const tag of ['1.2.3', 'v2.0.0', 'bad/tag', '../latest', '']) {
    assert.throws(() => validateDistTag(tag), /non-version npm dist-tag/u);
  }
});

test('validates every planned artifact before replacing an existing output', async (t) => {
  const cases = [
    {
      name: 'missing artifact',
      mutate: async (fixture) => {
        await rm(path.join(fixture.artifacts, 'nocobase-alpha.tgz'));
      },
      pattern: /Missing tarball for @nocobase\/alpha/u,
    },
    {
      name: 'packed version mismatch',
      mutate: async (fixture) => {
        await createArchive(
          path.join(fixture.artifacts, 'nocobase-alpha.tgz'),
          manifest('@nocobase/alpha', '9.0.0'),
          fixture.root,
        );
      },
      pattern: /Packed identity mismatch/u,
    },
    {
      name: 'duplicate release',
      mutatePlan: (document) => {
        document.plan.push([{ ...document.plan[0][0] }]);
      },
      pattern: /Duplicate release entry/u,
    },
    {
      name: 'illegal kind',
      mutatePlan: (document) => {
        document.plan[0][0].kind = 'remove';
      },
      pattern: /kind must be publish or tag-only/u,
    },
    {
      name: 'unsupported schema',
      mutatePlan: (document) => {
        document.version = 2;
      },
      pattern: /expected 1/u,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async (subtest) => {
      const fixture = await createFixture(subtest);
      const document = publishPlan();
      testCase.mutatePlan?.(document);
      await writePlan(fixture.planPath, document);
      await testCase.mutate?.(fixture);
      const planBefore = await readFile(fixture.planPath);

      await assert.rejects(runPrepare(fixture), testCase.pattern);
      assert.deepEqual(await readFile(fixture.planPath), planBefore);
      assert.deepEqual(await readdir(fixture.output), ['publish-plan.json']);
      assert.deepEqual(
        (await readdir(fixture.root)).filter((entry) =>
          entry.startsWith('.release-pack-'),
        ),
        [],
      );
    });
  }
});

test('validate-only rejects tampered tarballs and candidate source version drift without writing', async (t) => {
  await t.test('tampered tarball', async (subtest) => {
    const fixture = await createFixture(subtest);
    await writePlan(fixture.planPath, publishPlan());
    await runPrepare(fixture);
    const tarball = path.join(fixture.output, 'packages/nocobase-alpha.tgz');
    await appendFile(tarball, 'tampered');
    const planBefore = await readFile(fixture.planPath);
    const tarballBefore = await readFile(tarball);

    await assert.rejects(runValidate(fixture), /integrity mismatch/u);
    assert.deepEqual(await readFile(fixture.planPath), planBefore);
    assert.deepEqual(await readFile(tarball), tarballBefore);
  });

  await t.test('candidate source version drift', async (subtest) => {
    const fixture = await createFixture(subtest);
    await writePlan(fixture.planPath, publishPlan());
    await runPrepare(fixture);
    const sourceManifest = path.join(
      fixture.repoRoot,
      'packages/libs/alpha/package.json',
    );
    await writeFile(
      sourceManifest,
      `${JSON.stringify(manifest('@nocobase/alpha', '1.0.1'), null, 2)}\n`,
    );
    await writeFile(
      path.join(fixture.repoRoot, 'packages/libs/alpha/CHANGELOG.md'),
      '# @nocobase/alpha\n\n## 1.0.1\n',
    );
    const planBefore = await readFile(fixture.planPath);

    await assert.rejects(runValidate(fixture), /source is 1\.0\.1/u);
    assert.deepEqual(await readFile(fixture.planPath), planBefore);
  });
});

test('validate-only rejects absolute and parent-relative tarball paths', async (t) => {
  for (const [name, invalidPath] of [
    ['absolute', path.join(path.parse(process.cwd()).root, 'outside.tgz')],
    ['parent-relative', '../outside.tgz'],
  ]) {
    await t.test(name, async (subtest) => {
      const fixture = await createFixture(subtest);
      await writePlan(fixture.planPath, publishPlan());
      await runPrepare(fixture);
      const document = JSON.parse(await readFile(fixture.planPath, 'utf8'));
      document.plan[0][0].tarball.path = invalidPath;
      await writePlan(fixture.planPath, document);
      const planBefore = await readFile(fixture.planPath);

      await assert.rejects(runValidate(fixture), /must stay inside --output/u);
      assert.deepEqual(await readFile(fixture.planPath), planBefore);
    });
  }
});

function publishPlan() {
  return {
    version: 1,
    plan: [
      [
        {
          kind: 'publish',
          name: '@nocobase/alpha',
          version: '1.0.0',
          access: 'public',
          tag: 'latest',
        },
      ],
    ],
  };
}

function manifest(name, version) {
  return {
    files: ['dist'],
    name,
    publishConfig: { access: 'public' },
    version,
  };
}

async function createFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'nocobase-release-pack-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const repoRoot = path.join(root, 'repo');
  const artifacts = path.join(root, 'artifacts');
  const output = path.join(root, 'release-pack');
  await mkdir(artifacts);
  await mkdir(output);
  for (const [relativeDirectory, name, version] of [
    ['libs/alpha', '@nocobase/alpha', '1.0.0'],
    ['libs/beta', '@nocobase/beta', '2.0.0'],
  ]) {
    const packageDirectory = path.join(repoRoot, 'packages', relativeDirectory);
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      path.join(packageDirectory, 'package.json'),
      `${JSON.stringify(manifest(name, version), null, 2)}\n`,
    );
    await writeFile(
      path.join(packageDirectory, 'CHANGELOG.md'),
      `# ${name}\n\n## ${version}\n`,
    );
  }
  await createArchive(
    path.join(artifacts, 'nocobase-alpha.tgz'),
    manifest('@nocobase/alpha', '1.0.0'),
    root,
  );
  return {
    artifacts,
    output,
    planPath: path.join(output, 'publish-plan.json'),
    repoRoot,
    root,
  };
}

let archiveSequence = 0;
async function createArchive(archivePath, packageManifest, root) {
  archiveSequence += 1;
  const staging = path.join(root, `archive-${archiveSequence}`);
  const packageDirectory = path.join(staging, 'package');
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    `${JSON.stringify(packageManifest, null, 2)}\n`,
  );
  await execFileAsync('tar', ['-czf', archivePath, '-C', staging, 'package']);
}

async function writePlan(planPath, document) {
  await writeFile(planPath, `${JSON.stringify(document, null, 2)}\n`);
}

function runPrepare(fixture, extra = []) {
  return execFileAsync(process.execPath, [
    script,
    '--plan',
    fixture.planPath,
    '--artifacts',
    fixture.artifacts,
    '--output',
    fixture.output,
    '--repo-root',
    fixture.repoRoot,
    ...extra,
  ]);
}

function runValidate(fixture) {
  return execFileAsync(process.execPath, [
    script,
    '--validate-only',
    '--plan',
    fixture.planPath,
    '--output',
    fixture.output,
    '--repo-root',
    fixture.repoRoot,
  ]);
}
