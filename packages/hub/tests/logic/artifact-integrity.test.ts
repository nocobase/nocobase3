// @vitest-environment node

import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AppRuntimeRegistry } from '@nocobase/app-host';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertReleaseArtifactChecksum,
  computeReleaseArtifactChecksum,
  resolveReleaseArtifactDirectory,
} from '../../server/hub/artifact-integrity.ts';
import { LocalHostAdapter } from '../../server/hub/local-host-adapter.ts';
import type {
  HubApplication,
  HubDeployment,
  HubRelease,
} from '../../server/hub/types.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('release artifact integrity', () => {
  it('computes a stable digest over sorted relative paths and file contents', async () => {
    const root = await createArtifact();

    await expect(computeReleaseArtifactChecksum(root)).resolves.toBe(
      'sha256:e78b34223c8fe18171f86767024d0e52cf7be1637b1b1bb0eacb4f19e895ae0f',
    );
  });

  it('requires the canonical lowercase checksum representation', async () => {
    const root = await createArtifact();
    const checksum = await computeReleaseArtifactChecksum(root);

    await expect(
      assertReleaseArtifactChecksum(root, checksum.toUpperCase()),
    ).rejects.toMatchObject({
      code: 'RELEASE_CHECKSUM_INVALID',
      status: 422,
    });
  });

  it('rejects content tampering and symbolic links', async () => {
    const root = await createArtifact();
    const checksum = await computeReleaseArtifactChecksum(root);

    await writeFile(path.join(root, 'dist/server/embedded.js'), 'tampered');
    await expect(
      assertReleaseArtifactChecksum(root, checksum),
    ).rejects.toMatchObject({ code: 'RELEASE_CHECKSUM_MISMATCH', status: 422 });

    await symlink(
      path.join(root, 'package.json'),
      path.join(root, 'dist/client/package-link.json'),
    );
    await expect(computeReleaseArtifactChecksum(root)).rejects.toMatchObject({
      code: 'RELEASE_ARTIFACT_UNSUPPORTED_ENTRY',
      status: 422,
    });
  });

  it('rejects a storage path whose ancestor symlink escapes the release root', async () => {
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-release-root-'),
    );
    const outsideRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-outside-root-'),
    );
    temporaryDirectories.push(releaseRoot, outsideRoot);
    await mkdir(path.join(outsideRoot, '1.0.0'), { recursive: true });
    await symlink(outsideRoot, path.join(releaseRoot, 'inventory'));

    expect(() =>
      resolveReleaseArtifactDirectory({
        releaseRoot,
        applicationSlug: 'inventory',
        storageKey: 'inventory/1.0.0',
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'INVALID_RELEASE_STORAGE_KEY',
        status: 422,
      }),
    );
  });

  it('rejects a tampered release before invoking App Host', async () => {
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-release-root-'),
    );
    temporaryDirectories.push(releaseRoot);
    const application = applicationFixture();
    const storageKey = `${application.slug}/1.0.0`;
    const artifact = path.join(releaseRoot, storageKey);
    await mkdir(path.dirname(artifact), { recursive: true });
    await createArtifact(artifact);
    const checksum = await computeReleaseArtifactChecksum(artifact);
    const deploy = vi.fn();
    const registry = {
      snapshot: () => undefined,
      definition: () => undefined,
      deploy,
    } as unknown as AppRuntimeRegistry;
    const adapter = new LocalHostAdapter({ registry, releaseRoot });

    await writeFile(path.join(artifact, 'dist/server/embedded.js'), 'tampered');

    await expect(
      adapter.deploy({
        application,
        release: releaseFixture(application.id, storageKey, checksum),
        deployment: deploymentFixture(application.id),
      }),
    ).rejects.toMatchObject({ code: 'RELEASE_CHECKSUM_MISMATCH', status: 422 });
    expect(deploy).not.toHaveBeenCalled();
  });

  it('keeps embedded app data outside the immutable release artifact', async () => {
    const releaseRoot = await mkdtemp(
      path.join(tmpdir(), 'nocobase-hub-release-root-'),
    );
    temporaryDirectories.push(releaseRoot);
    const application = applicationFixture();
    const storageKey = `${application.slug}/1.0.0`;
    const artifact = path.join(releaseRoot, storageKey);
    await mkdir(path.join(artifact, 'dist/server'), { recursive: true });
    await writeFile(
      path.join(artifact, 'dist/server/embedded.js'),
      'export {};\n',
    );
    const checksum = await computeReleaseArtifactChecksum(artifact);
    const deploy = vi.fn().mockResolvedValue(undefined);
    const registry = {
      snapshot: () => undefined,
      definition: () => undefined,
      deploy,
    } as unknown as AppRuntimeRegistry;
    const adapter = new LocalHostAdapter({ registry, releaseRoot });

    await adapter.deploy({
      application,
      release: releaseFixture(application.id, storageKey, checksum),
      deployment: deploymentFixture(application.id),
    });

    expect(deploy).toHaveBeenCalledWith(
      application.slug,
      expect.objectContaining({
        target: expect.objectContaining({
          dataDir: path.join(releaseRoot, '.runtime', application.slug),
        }),
      }),
    );
  });
});

async function createArtifact(root?: string): Promise<string> {
  const artifactRoot =
    root ?? (await mkdtemp(path.join(tmpdir(), 'nocobase-hub-artifact-')));
  if (!root) temporaryDirectories.push(artifactRoot);
  await mkdir(path.join(artifactRoot, 'dist/server'), { recursive: true });
  await mkdir(path.join(artifactRoot, 'dist/client'), { recursive: true });
  await writeFile(
    path.join(artifactRoot, 'package.json'),
    '{"type":"module"}\n',
  );
  await writeFile(
    path.join(artifactRoot, 'dist/server/embedded.js'),
    'export default "server";\n',
  );
  await writeFile(
    path.join(artifactRoot, 'dist/client/index.html'),
    '<!doctype html>\n',
  );
  return artifactRoot;
}

function applicationFixture(): HubApplication {
  const now = new Date().toISOString();
  return {
    id: 'app-1',
    slug: 'inventory',
    name: 'Inventory',
    description: null,
    status: 'active',
    defaultEnvironmentId: 'default',
    activeReleaseId: null,
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
  };
}

function releaseFixture(
  applicationId: string,
  storageKey: string,
  checksum: string,
): HubRelease {
  return {
    id: 'release-1',
    applicationId,
    version: '1.0.0',
    checksum,
    manifest: {},
    storageKey,
    sizeBytes: null,
    sourceCommit: null,
    verificationStatus: 'verified',
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
  };
}

function deploymentFixture(applicationId: string): HubDeployment {
  return {
    id: 'deployment-1',
    applicationId,
    environmentId: 'default',
    targetReleaseId: 'release-1',
    previousReleaseId: null,
    type: 'deploy',
    status: 'queued',
    requestedBy: 'user-1',
    idempotencyKey: null,
    hostOperationId: null,
    startedAt: null,
    finishedAt: null,
    failureCode: null,
    failureMessage: null,
    createdAt: new Date().toISOString(),
  };
}
