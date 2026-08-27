// @vitest-environment node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

import { computeReleaseArtifactChecksum } from '../../server/hub/artifact-integrity.ts';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const generator = path.join(
  packageRoot,
  'scripts/build-default-app-resources.mjs',
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('default APP resources', () => {
  it('generates deterministic artifact-only release resources', async () => {
    const fixture = await createFixture();
    const first = path.join(fixture.root, 'first');
    const second = path.join(fixture.root, 'second');

    await generate(fixture, first);
    await generate(fixture, second);

    const firstMetadata = await readMetadata(first);
    const secondMetadata = await readMetadata(second);
    expect(secondMetadata).toEqual(firstMetadata);
    expect((await readdir(first)).sort()).toEqual([
      'initial-release.tar.gz',
      'metadata.json',
    ]);
    expect((await readdir(second)).sort()).toEqual([
      'initial-release.tar.gz',
      'metadata.json',
    ]);
    await expect(
      readFile(path.join(second, 'initial-release.tar.gz')),
    ).resolves.toEqual(
      await readFile(path.join(first, 'initial-release.tar.gz')),
    );

    const { stdout: archiveEntries } = await execFileAsync('tar', [
      '-tzf',
      path.join(first, 'initial-release.tar.gz'),
    ]);
    expect(archiveEntries).toContain('dist/server/embedded.js');
    expect(archiveEntries).toContain('nocobase-release.json');
    expect(archiveEntries).not.toMatch(/(?:^|\/)\.env(?:\.|$)/m);
    expect(archiveEntries).not.toMatch(
      /(?:^|\/)(?:storage|\.nocobase|tests|e2e|coverage|test-results)(?:\/|$)/m,
    );

    const extract = path.join(fixture.root, 'extract');
    await mkdir(extract);
    await execFileAsync('tar', [
      '-xzf',
      path.join(first, 'initial-release.tar.gz'),
      '-C',
      extract,
    ]);
    const manifest = JSON.parse(
      await readFile(path.join(extract, 'nocobase-release.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest).toEqual(firstMetadata.release.manifest);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      basePath: '/default',
      client: { rootDir: 'dist/client' },
      server: {
        entrypoint: 'dist/server/embedded.js',
        healthPath: '/api/healthz',
      },
    });
    expect(Object.keys(manifest).sort()).toEqual([
      'basePath',
      'client',
      'schemaVersion',
      'server',
    ]);
    expect(Object.keys(firstMetadata.release).sort()).toEqual([
      'archiveChecksum',
      'archiveFormat',
      'archiveSizeBytes',
      'checksum',
      'manifest',
      'sizeBytes',
      'version',
    ]);
    await expect(computeReleaseArtifactChecksum(extract)).resolves.toBe(
      firstMetadata.release.checksum,
    );
    const releaseFiles = await listRegularFiles(extract);
    await expect(totalFileSize(extract, releaseFiles)).resolves.toBe(
      firstMetadata.release.sizeBytes,
    );
    const releaseArchive = await readFile(
      path.join(first, 'initial-release.tar.gz'),
    );
    expect(
      `sha256:${createHash('sha256').update(releaseArchive).digest('hex')}`,
    ).toBe(firstMetadata.release.archiveChecksum);
    expect(releaseArchive.byteLength).toBe(
      firstMetadata.release.archiveSizeBytes,
    );
    expect(firstMetadata.resourceDigest).toBe(
      `sha256:${createHash('sha256')
        .update(
          Buffer.concat([
            Buffer.from('nocobase-default-app-resources-v1\0', 'utf8'),
            createHash('sha256').update(releaseArchive).digest(),
          ]),
        )
        .digest('hex')}`,
    );
  });

  it('rejects symbolic links instead of following them into a release', async () => {
    const fixture = await createFixture();
    await symlink(
      path.join(fixture.build, 'server/embedded.js'),
      path.join(fixture.build, 'server/linked.js'),
    );

    await expect(
      generate(fixture, path.join(fixture.root, 'invalid')),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('symbolic link'),
    });
  });
});

interface ResourceMetadata {
  readonly schemaVersion: 1;
  readonly resourceDigest: string;
  readonly application: {
    readonly slug: 'default';
    readonly name: string;
    readonly description: string | null;
  };
  readonly release: {
    readonly version: string;
    readonly checksum: string;
    readonly sizeBytes: number;
    readonly archiveChecksum: string;
    readonly archiveSizeBytes: number;
    readonly archiveFormat: 'tar.gz';
    readonly manifest: Record<string, unknown>;
  };
}

async function readMetadata(directory: string): Promise<ResourceMetadata> {
  return JSON.parse(
    await readFile(path.join(directory, 'metadata.json'), 'utf8'),
  ) as ResourceMetadata;
}

async function createFixture(): Promise<{
  readonly root: string;
  readonly build: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'hub-default-resources-'));
  temporaryDirectories.push(root);
  const build = path.join(root, 'build');
  await mkdir(path.join(build, 'server'), { recursive: true });
  await mkdir(path.join(build, 'client'), { recursive: true });
  await writeFile(
    path.join(build, 'server/embedded.js'),
    'export default async () => ({ fetch: () => Response.json({ ok: true }) });\n',
  );
  await writeFile(
    path.join(build, 'client/index.html'),
    '<main>Default</main>\n',
  );
  await writeFile(path.join(build, '.env'), 'SECRET=must-not-ship\n');
  await mkdir(path.join(build, 'storage'), { recursive: true });
  await writeFile(path.join(build, 'storage/database.sqlite'), 'runtime data');
  await mkdir(path.join(build, 'public/storage'), { recursive: true });
  await writeFile(
    path.join(build, 'public/storage/upload.txt'),
    'runtime upload',
  );
  await mkdir(path.join(build, '.nocobase'), { recursive: true });
  await writeFile(path.join(build, '.nocobase/state.json'), '{}\n');
  await mkdir(path.join(build, 'node_modules/example/dist/tests'), {
    recursive: true,
  });
  await writeFile(
    path.join(build, 'node_modules/example/dist/tests/example.test.js'),
    'throw new Error("must not ship");\n',
  );
  await mkdir(path.join(build, 'node_modules/example/e2e'), {
    recursive: true,
  });
  await writeFile(
    path.join(build, 'node_modules/example/e2e/example.spec.js'),
    'throw new Error("must not ship");\n',
  );
  await mkdir(path.join(build, 'node_modules/example/coverage'), {
    recursive: true,
  });
  await writeFile(
    path.join(build, 'node_modules/example/coverage/index.html'),
    'must not ship\n',
  );
  await mkdir(path.join(build, 'node_modules/example/test-results'), {
    recursive: true,
  });
  await writeFile(
    path.join(build, 'node_modules/example/test-results/results.json'),
    '{}\n',
  );
  return { root, build };
}

async function listRegularFiles(
  root: string,
  directory: string = root,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const stat = await lstat(absolute);
    expect(stat.isSymbolicLink()).toBe(false);
    if (stat.isDirectory()) {
      files.push(...(await listRegularFiles(root, absolute)));
    } else {
      expect(stat.isFile()).toBe(true);
      files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  return files;
}

async function totalFileSize(root: string, files: string[]): Promise<number> {
  const sizes = await Promise.all(
    files.map(
      async (relative) =>
        (await lstat(path.join(root, ...relative.split('/')))).size,
    ),
  );
  return sizes.reduce((total, size) => total + size, 0);
}

async function generate(
  fixture: { readonly build: string },
  output: string,
): Promise<void> {
  await execFileAsync(process.execPath, [
    generator,
    '--build-dir',
    fixture.build,
    '--output-dir',
    output,
    '--version',
    '0.0.1',
  ]);
}
