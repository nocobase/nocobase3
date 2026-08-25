// @vitest-environment node

import { AppRuntimeRegistry } from '@nocobase/app-host';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { computeReleaseArtifactChecksum } from '../../server/hub/artifact-integrity.ts';
import { LocalHostAdapter } from '../../server/hub/local-host-adapter.ts';
import type {
  HubApplication,
  HubDeployment,
  HubRelease,
} from '../../server/hub/types.ts';

const registries: AppRuntimeRegistry[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    registries
      .splice(0)
      .map((registry) => registry.destroyAll({ reason: 'test cleanup' })),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('LocalHostAdapter runtime control', () => {
  it('prepares a stopped application with its private secret without starting it', async () => {
    const fixture = await createFixture();

    const definition = await fixture.adapter.prepare(
      fixture.application,
      fixture.release,
      'app-private-secret',
      true,
    );

    expect(definition.id).toBe(fixture.application.slug);
    expect(fixture.registry.snapshot(fixture.application.slug)).toBeUndefined();
    expect(
      fixture.registry.definition(fixture.application.slug)?.config,
    ).toBeUndefined();

    await fixture.registry.ensureActive(fixture.application.slug);
    expect(fixture.activatedSecrets).toEqual(['app-private-secret']);
  });

  it('starts, stops, and restarts only the selected active release', async () => {
    const fixture = await createFixture();
    await fixture.adapter.prepare(
      fixture.application,
      fixture.release,
      'secret-v1',
      true,
    );

    const started = await fixture.adapter.start(
      fixture.application,
      fixture.release,
      'secret-v1',
      'start-1',
    );
    expect(started.app.releaseId).toBe(fixture.release.id);
    expect(started.app.state).toBe('active');

    await fixture.adapter.evict(fixture.application);
    expect(fixture.registry.snapshot(fixture.application.slug)).toBeUndefined();
    expect(fixture.registry.definition(fixture.application.slug)).toBeDefined();

    const restarted = await fixture.adapter.restart(
      fixture.application,
      fixture.release,
      'secret-v2',
      'restart-1',
    );
    expect(restarted.app.releaseId).toBe(fixture.release.id);
    expect(fixture.activatedSecrets).toEqual(['secret-v1', 'secret-v2']);
  });

  it('unregisters both a runtime and its definition when an application is archived', async () => {
    const fixture = await createFixture();
    await fixture.adapter.start(
      fixture.application,
      fixture.release,
      'secret-v1',
      'start-1',
    );

    await fixture.adapter.unregister(fixture.application);

    expect(fixture.registry.snapshot(fixture.application.slug)).toBeUndefined();
    expect(
      fixture.registry.definition(fixture.application.slug),
    ).toBeUndefined();
  });
});

async function createFixture(): Promise<{
  adapter: LocalHostAdapter;
  registry: AppRuntimeRegistry;
  application: HubApplication;
  release: HubRelease;
  deployment: HubDeployment;
  activatedSecrets: string[];
}> {
  const releaseRoot = await mkdtemp(
    path.join(tmpdir(), 'nocobase-hub-host-adapter-'),
  );
  temporaryDirectories.push(releaseRoot);
  const application = applicationFixture();
  const releaseDirectory = path.join(releaseRoot, application.slug, '1.0.0');
  await mkdir(path.join(releaseDirectory, 'dist/server'), { recursive: true });
  await writeFile(
    path.join(releaseDirectory, 'dist/server/embedded.js'),
    'export {};',
  );
  const release = releaseFixture(
    application.id,
    `${application.slug}/1.0.0`,
    await computeReleaseArtifactChecksum(releaseDirectory),
  );
  const activatedSecrets: string[] = [];
  const registry = new AppRuntimeRegistry({
    startEvictionLoop: false,
    resolveFactory: () => (scope) => {
      const config = scope.config as { authSecret?: unknown } | undefined;
      if (typeof config?.authSecret === 'string') {
        activatedSecrets.push(config.authSecret);
      }
      return {
        fetch: () => Response.json({ ok: true }),
      };
    },
  });
  registries.push(registry);
  return {
    adapter: new LocalHostAdapter({ registry, releaseRoot }),
    registry,
    application,
    release,
    deployment: deploymentFixture(application.id, release.id),
    activatedSecrets,
  };
}

function applicationFixture(): HubApplication {
  const now = new Date().toISOString();
  return {
    id: 'app-1',
    slug: 'sales',
    name: 'Sales',
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

function deploymentFixture(
  applicationId: string,
  releaseId: string,
): HubDeployment {
  return {
    id: 'deployment-1',
    applicationId,
    environmentId: 'default',
    targetReleaseId: releaseId,
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
