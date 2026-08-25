import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildReleaseArtifact,
  computeReleaseArtifactChecksum,
} from '../src/lib/release-artifact.ts';

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function fixture(): Promise<{
  root: string;
  build: string;
  output: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-release-test-'));
  roots.push(root);
  const build = path.join(root, 'build');
  await mkdir(path.join(build, 'client'), { recursive: true });
  await mkdir(path.join(build, 'server'), { recursive: true });
  await writeFile(
    path.join(build, 'client/index.html'),
    '<main>Sales</main>\n',
  );
  await writeFile(
    path.join(build, 'server/embedded.js'),
    'export default {};\n',
  );
  await writeFile(path.join(build, '.env'), 'SECRET=must-not-ship\n');
  return { root, build, output: path.join(root, 'release.tar.gz') };
}

describe('buildReleaseArtifact', () => {
  it('creates a Hub-compatible archive with only the manifest and dist tree', async () => {
    const { root, build, output } = await fixture();
    const result = await buildReleaseArtifact({
      applicationSlug: 'sales',
      buildDirectory: build,
      outputPath: output,
      sourceCommit: '95b5799ad8c628b73dd79a55a1c37d58b25a2a93',
    });

    const { stdout } = await execFileAsync('tar', ['-tzf', output]);
    const entries = stdout
      .trim()
      .split('\n')
      .map((entry) => entry.replace(/^\.\//, '').replace(/\/$/, ''));
    expect(entries).toContain('nocobase-release.json');
    expect(entries).toContain('dist/client/index.html');
    expect(entries).toContain('dist/server/embedded.js');
    expect(entries).not.toContain('dist/.env');
    expect(
      entries.every(
        (entry) =>
          entry === 'dist' ||
          entry.startsWith('dist/') ||
          entry === 'nocobase-release.json',
      ),
    ).toBe(true);

    const extract = path.join(root, 'extract');
    await mkdir(extract);
    await execFileAsync('tar', ['-xzf', output, '-C', extract]);
    expect(
      JSON.parse(
        await readFile(path.join(extract, 'nocobase-release.json'), 'utf8'),
      ),
    ).toEqual(result.manifest);
    expect(result.manifest).toEqual({
      schemaVersion: 1,
      basePath: '/sales',
      client: { rootDir: 'dist/client' },
      server: {
        entrypoint: 'dist/server/embedded.js',
        healthPath: '/api/healthz',
      },
      source: { commit: '95b5799ad8c628b73dd79a55a1c37d58b25a2a93' },
    });
    expect(result.checksum).toBe(await computeReleaseArtifactChecksum(extract));
    expect(result.sizeBytes).toBe(
      Buffer.byteLength(
        await readFile(path.join(extract, 'nocobase-release.json')),
      ) +
        Buffer.byteLength(
          await readFile(path.join(extract, 'dist/client/index.html')),
        ) +
        Buffer.byteLength(
          await readFile(path.join(extract, 'dist/server/embedded.js')),
        ),
    );
    const archive = await readFile(output);
    expect(result.archiveChecksum).toBe(
      `sha256:${createHash('sha256').update(archive).digest('hex')}`,
    );
    expect(result.archiveSizeBytes).toBe(archive.byteLength);
    expect(result.archiveFormat).toBe('tar.gz');
    expect((await lstat(output)).mode & 0o777).toBe(0o600);
  });

  it('produces byte-identical archives for the same build input', async () => {
    const { root, build, output } = await fixture();
    const options = {
      applicationSlug: 'sales',
      buildDirectory: build,
      sourceCommit: '95b5799ad8c628b73dd79a55a1c37d58b25a2a93',
    };

    const first = await buildReleaseArtifact({
      ...options,
      outputPath: output,
    });
    const secondPath = path.join(root, 'release-second.tar.gz');
    const second = await buildReleaseArtifact({
      ...options,
      outputPath: secondPath,
    });

    expect(await readFile(secondPath)).toEqual(await readFile(output));
    expect(second).toMatchObject({
      archiveChecksum: first.archiveChecksum,
      checksum: first.checksum,
      sizeBytes: first.sizeBytes,
    });
  });

  it('rejects symbolic links in build output', async () => {
    const { build, output } = await fixture();
    await symlink(
      path.join(build, 'client/index.html'),
      path.join(build, 'client/linked.html'),
    );

    await expect(
      buildReleaseArtifact({
        applicationSlug: 'sales',
        buildDirectory: build,
        outputPath: output,
        sourceCommit: '95b5799ad8c628b73dd79a55a1c37d58b25a2a93',
      }),
    ).rejects.toMatchObject({ code: 'LOCAL_RELEASE_UNSUPPORTED_ENTRY' });
  });

  it('excludes nested environment files from the release', async () => {
    const { root, build, output } = await fixture();
    await writeFile(
      path.join(build, 'server/.env.production'),
      'SECRET=nested',
    );

    await buildReleaseArtifact({
      applicationSlug: 'sales',
      buildDirectory: build,
      outputPath: output,
      sourceCommit: '95b5799ad8c628b73dd79a55a1c37d58b25a2a93',
    });
    const extract = path.join(root, 'extract-nested-env');
    await mkdir(extract);
    await execFileAsync('tar', ['-xzf', output, '-C', extract]);

    await expect(
      readFile(path.join(extract, 'dist/server/.env.production')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('computeReleaseArtifactChecksum', () => {
  it('matches a fixed canonical v1 digest vector', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'nb3-digest-test-'));
    roots.push(root);
    await mkdir(path.join(root, 'nested'));
    await writeFile(path.join(root, 'a.txt'), 'alpha');
    await writeFile(path.join(root, 'nested/b.txt'), 'beta');

    expect(await computeReleaseArtifactChecksum(root)).toBe(
      'sha256:0f6e648f879d262ce00dceb5b8d07f36a7be51e1631d6767ad59aa0396fb2e40',
    );
  });
});
