import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  npmPublishArguments,
  publishPackArtifacts,
  validateLoopbackRegistry,
  validatePackArtifacts,
} from '../../scripts/publish-pack-artifacts.mjs';

const execFileAsync = promisify(execFile);
const registry = 'http://localhost:4873/';

test('publishes the validated pack-check tarballs unchanged with safe npm flags', async (t) => {
  const fixture = await createFixture(t, [
    ['libs/alpha', '@nocobase/alpha', '1.2.3'],
    ['tools/zeta', '@nocobase/zeta', '4.5.6'],
  ]);
  const calls = [];

  await publishPackArtifacts({
    artifactsDirectory: fixture.artifactsDirectory,
    concurrency: 2,
    publish: async (options) => calls.push(options),
    registry,
    repoRoot: fixture.repoRoot,
  });

  calls.sort((left, right) =>
    left.archivePath.localeCompare(right.archivePath),
  );
  assert.deepEqual(
    calls.map(({ archivePath, registry: resolvedRegistry }) => ({
      archivePath,
      registry: resolvedRegistry,
    })),
    [
      {
        archivePath: path.join(
          fixture.artifactsDirectory,
          'nocobase-alpha.tgz',
        ),
        registry,
      },
      {
        archivePath: path.join(fixture.artifactsDirectory, 'nocobase-zeta.tgz'),
        registry,
      },
    ],
  );
  assert.deepEqual(
    npmPublishArguments(calls[0].archivePath, calls[0].registry),
    [
      'publish',
      calls[0].archivePath,
      '--ignore-scripts',
      '--provenance=false',
      '--tag',
      'smoke',
      '--registry',
      registry,
    ],
  );
});

test('stops assigning artifacts after a concurrent publish fails and waits for in-flight commands', async (t) => {
  const fixture = await createFixture(t, [
    ['libs/alpha', '@nocobase/alpha', '1.0.0'],
    ['libs/beta', '@nocobase/beta', '1.0.0'],
    ['libs/gamma', '@nocobase/gamma', '1.0.0'],
  ]);
  const calls = [];
  let releaseAlpha;
  const alphaFinished = new Promise((resolve) => {
    releaseAlpha = resolve;
  });
  let signalBetaAttempted;
  const betaAttempted = new Promise((resolve) => {
    signalBetaAttempted = resolve;
  });

  const operation = publishPackArtifacts({
    artifactsDirectory: fixture.artifactsDirectory,
    concurrency: 2,
    publish: async ({ archivePath }) => {
      const packageName = path.basename(archivePath);
      calls.push(packageName);
      if (packageName === 'nocobase-alpha.tgz') await alphaFinished;
      if (packageName === 'nocobase-beta.tgz') {
        signalBetaAttempted();
        throw new Error('registry refused beta');
      }
    },
    registry,
    repoRoot: fixture.repoRoot,
  });
  let settled = false;
  const outcome = operation.then(
    () => ({ status: 'fulfilled' }),
    (error) => ({ error, status: 'rejected' }),
  );
  outcome.then(() => {
    settled = true;
  });

  await betaAttempted;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'the helper must wait for alpha to finish');
  assert.deepEqual(calls.sort(), ['nocobase-alpha.tgz', 'nocobase-beta.tgz']);
  releaseAlpha();
  const result = await outcome;
  assert.equal(result.status, 'rejected');
  assert.match(result.error.message, /Failed to publish @nocobase\/beta/u);
  assert.ok(!calls.includes('nocobase-gamma.tgz'));
});

test('validates every expected package before starting any publish', async (t) => {
  const fixture = await createFixture(t, [
    ['libs/alpha', '@nocobase/alpha', '1.0.0'],
    ['libs/beta', '@nocobase/beta', '1.0.0'],
  ]);
  await rm(path.join(fixture.artifactsDirectory, 'nocobase-beta.tgz'));
  let publishCalls = 0;

  await assert.rejects(
    publishPackArtifacts({
      artifactsDirectory: fixture.artifactsDirectory,
      publish: async () => {
        publishCalls += 1;
      },
      registry,
      repoRoot: fixture.repoRoot,
    }),
    /Missing artifact nocobase-beta\.tgz/u,
  );
  assert.equal(
    publishCalls,
    0,
    'a validation failure must stop before the publish and smoke-test steps',
  );
});

test('rejects stale, duplicate, and renamed artifacts as a set', async (t) => {
  const fixture = await createFixture(t, [
    ['libs/alpha', '@nocobase/alpha', '1.0.0'],
    ['libs/beta', '@nocobase/beta', '1.0.0'],
  ]);
  await createArchive({
    archivePath: path.join(fixture.artifactsDirectory, 'duplicate-alpha.tgz'),
    manifest: createManifest('@nocobase/alpha', '1.0.0'),
    temporaryDirectory: fixture.temporaryDirectory,
  });
  await createArchive({
    archivePath: path.join(fixture.artifactsDirectory, 'nocobase-beta.tgz'),
    manifest: createManifest('@nocobase/beta', '2.0.0'),
    temporaryDirectory: fixture.temporaryDirectory,
  });

  await assert.rejects(
    validatePackArtifacts({
      artifactsDirectory: fixture.artifactsDirectory,
      registry,
      repoRoot: fixture.repoRoot,
    }),
    (error) => {
      assert.match(error.message, /Duplicate artifact for @nocobase\/alpha/u);
      assert.match(error.message, /expected @nocobase\/beta@1\.0\.0/u);
      return true;
    },
  );
});

test('refuses non-loopback registries and package-level registry redirects', async (t) => {
  assert.equal(
    validateLoopbackRegistry('http://127.0.0.2:4873'),
    registry.replace('localhost', '127.0.0.2'),
  );
  assert.equal(
    validateLoopbackRegistry('http://[::1]:4873'),
    'http://[::1]:4873/',
  );
  assert.throws(
    () => validateLoopbackRegistry('https://registry.npmjs.org/'),
    /restricted to a loopback registry/u,
  );

  const fixture = await createFixture(t, [
    ['libs/alpha', '@nocobase/alpha', '1.0.0'],
  ]);
  await createArchive({
    archivePath: path.join(fixture.artifactsDirectory, 'nocobase-alpha.tgz'),
    manifest: {
      ...createManifest('@nocobase/alpha', '1.0.0'),
      publishConfig: {
        access: 'public',
        registry: 'https://registry.npmjs.org/',
      },
    },
    temporaryDirectory: fixture.temporaryDirectory,
  });

  await assert.rejects(
    validatePackArtifacts({
      artifactsDirectory: fixture.artifactsDirectory,
      registry,
      repoRoot: fixture.repoRoot,
    }),
    /unsafe publishConfig\.registry[\s\S]*restricted to a loopback registry/u,
  );
});

test('keeps release mode as the default and orders artifact validation before smoke generation', async () => {
  const action = await readFile(
    new URL(
      '../../.github/actions/verify-create-app/action.yml',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(action, /package-artifacts:[\s\S]*default: ''/u);
  assert.match(action, /template-kind:[\s\S]*default: all/u);
  assert.ok(
    action.indexOf('Validate smoke-test inputs and package artifacts') <
      action.indexOf('Start the throwaway registry'),
  );
  assert.ok(
    action.indexOf('Publish package artifacts to the throwaway registry') <
      action.indexOf(
        'Generate selected applications and verify test, dev, build, and start',
      ),
  );
  assert.match(
    action,
    /Publish packages to the throwaway registry[\s\S]*if: inputs\.package-artifacts == ''[\s\S]*pnpm changeset publish --no-git-tag/u,
  );
});

function createManifest(name, version) {
  return {
    files: ['dist'],
    name,
    publishConfig: { access: 'public' },
    version,
  };
}

async function createFixture(t, packages) {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'nocobase-pack-artifacts-test-'),
  );
  t.after(() => rm(temporaryDirectory, { force: true, recursive: true }));
  const repoRoot = path.join(temporaryDirectory, 'repo');
  const artifactsDirectory = path.join(temporaryDirectory, 'artifacts');
  await mkdir(artifactsDirectory, { recursive: true });

  for (const [relativeDirectory, name, version] of packages) {
    const packageDirectory = path.join(repoRoot, 'packages', relativeDirectory);
    const manifest = createManifest(name, version);
    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      path.join(packageDirectory, 'package.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    await writeFile(
      path.join(packageDirectory, 'CHANGELOG.md'),
      `# ${name}\n\n## ${version}\n`,
    );
    await createArchive({
      archivePath: path.join(
        artifactsDirectory,
        `${name.replace(/^@/u, '').replaceAll('/', '-')}.tgz`,
      ),
      manifest,
      temporaryDirectory,
    });
  }

  return { artifactsDirectory, repoRoot, temporaryDirectory };
}

let archiveSequence = 0;
async function createArchive({ archivePath, manifest, temporaryDirectory }) {
  archiveSequence += 1;
  const stagingDirectory = path.join(
    temporaryDirectory,
    `archive-${archiveSequence}`,
  );
  const packageDirectory = path.join(stagingDirectory, 'package');
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    path.join(packageDirectory, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await execFileAsync('tar', [
    '-czf',
    archivePath,
    '-C',
    stagingDirectory,
    'package',
  ]);
}
