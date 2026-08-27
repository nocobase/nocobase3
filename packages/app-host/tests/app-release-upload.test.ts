import { createReadStream } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { create } from 'tar';
import { afterEach, describe, expect, it } from 'vitest';

import {
  hashArtifactDirectory,
  installAppReleaseArchive,
} from '../dist/index.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe('release archive installation', () => {
  it('atomically installs an immutable release and converges on retry', async () => {
    const fixture = await createReleaseArchive();
    const first = await install(fixture);
    const repeated = await install(fixture);

    expect(first).toMatchObject({
      status: 'created',
      appId: 'crm',
      releaseId: 'release-v1',
      version: '1.0.0',
    });
    expect(repeated).toMatchObject({
      status: 'unchanged',
      artifactSha256: first.artifactSha256,
    });
    await expect(
      readFile(
        path.join(
          fixture.appsDir,
          'crm/releases/release-v1/dist/server/embedded.js',
        ),
        'utf8',
      ),
    ).resolves.toContain('createServer');
    await expect(
      readdir(path.join(fixture.appsDir, '.app-host', 'uploads')),
    ).resolves.toEqual([]);
  });

  it('rejects the same release id with different package metadata', async () => {
    const fixture = await createReleaseArchive();
    await install(fixture);
    const conflicting = await createReleaseArchive({
      appsDir: fixture.appsDir,
      packageName: 'different-package',
    });

    await expect(install(conflicting)).rejects.toMatchObject({
      status: 409,
      code: 'APP_RELEASE_UPLOAD_CONFLICT',
    });
  });

  it('rejects link entries before extraction', async () => {
    const fixture = await createReleaseArchive({ withSymlink: true });

    await expect(install(fixture)).rejects.toMatchObject({
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_UNSAFE',
    });
    await expect(
      readdir(path.join(fixture.appsDir, 'crm', 'releases')),
    ).resolves.toEqual([]);
  });

  it('rejects files outside the release payload contract', async () => {
    const fixture = await createReleaseArchive({ withUnexpectedFile: true });

    await expect(install(fixture)).rejects.toMatchObject({
      status: 400,
      code: 'APP_RELEASE_ARCHIVE_UNSAFE',
    });
    await expect(
      readdir(path.join(fixture.appsDir, 'crm', 'releases')),
    ).resolves.toEqual([]);
  });

  it('rejects an artifact checksum mismatch without leaving a release', async () => {
    const fixture = await createReleaseArchive({
      artifactSha256: 'a'.repeat(64),
    });

    await expect(install(fixture)).rejects.toMatchObject({
      status: 409,
      code: 'APP_RELEASE_INTEGRITY_FAILED',
    });
    await expect(
      readdir(path.join(fixture.appsDir, 'crm', 'releases')),
    ).resolves.toEqual([]);
  });

  it('enforces the compressed upload size limit and leaves no partial release', async () => {
    const fixture = await createReleaseArchive();

    await expect(
      installAppReleaseArchive({
        appsDir: fixture.appsDir,
        appId: 'crm',
        releaseId: 'release-v1',
        source: createReadStream(fixture.archivePath),
        maxArchiveBytes: 1,
      }),
    ).rejects.toMatchObject({
      status: 413,
      code: 'APP_RELEASE_ARCHIVE_TOO_LARGE',
    });
    await expect(
      readdir(path.join(fixture.appsDir, 'crm', 'releases')),
    ).resolves.toEqual([]);
  });
});

interface ReleaseArchiveFixture {
  appsDir: string;
  archivePath: string;
}

async function createReleaseArchive(
  options: {
    appsDir?: string;
    packageName?: string;
    withSymlink?: boolean;
    withUnexpectedFile?: boolean;
    artifactSha256?: string;
  } = {},
): Promise<ReleaseArchiveFixture> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'app-release-upload-'));
  tempDirs.push(root);
  const appsDir = options.appsDir ?? path.join(root, 'app-dist');
  const releaseRoot = path.join(root, 'release');
  const distRoot = path.join(releaseRoot, 'dist');
  await mkdir(path.join(distRoot, 'server'), { recursive: true });
  await mkdir(path.join(distRoot, 'client'), { recursive: true });
  await writeFile(
    path.join(distRoot, 'server', 'embedded.js'),
    'export const createServer = () => ({ fetch: () => new Response("ok") });\n',
  );
  await writeFile(
    path.join(distRoot, 'client', 'index.html'),
    '<main>CRM</main>',
  );
  if (options.withSymlink) {
    await symlink('/private/tmp', path.join(distRoot, 'unsafe-link'));
  }
  if (options.withUnexpectedFile) {
    await writeFile(path.join(releaseRoot, 'source.ts'), 'source only\n');
  }
  const checksum =
    options.artifactSha256 ??
    (options.withSymlink
      ? 'a'.repeat(64)
      : await hashArtifactDirectory(distRoot));
  await writeFile(
    path.join(releaseRoot, 'app-release.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        appId: 'crm',
        releaseId: 'release-v1',
        version: '1.0.0',
        artifactSha256: checksum,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(releaseRoot, 'package.json'),
    `${JSON.stringify({
      name: options.packageName ?? 'crm',
      version: '1.0.0',
      type: 'module',
      private: true,
    })}\n`,
  );
  const archivePath = path.join(root, 'release.tgz');
  const entries = ['app-release.json', 'package.json', 'dist'];
  if (options.withUnexpectedFile) entries.push('source.ts');
  await create(
    { cwd: releaseRoot, file: archivePath, gzip: true, strict: true },
    entries,
  );
  return { appsDir, archivePath };
}

function install(
  fixture: ReleaseArchiveFixture,
): ReturnType<typeof installAppReleaseArchive> {
  return installAppReleaseArchive({
    appsDir: fixture.appsDir,
    appId: 'crm',
    releaseId: 'release-v1',
    source: createReadStream(fixture.archivePath),
  });
}
