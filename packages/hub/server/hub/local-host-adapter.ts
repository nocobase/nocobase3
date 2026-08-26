import type {
  AppDefinition,
  AppDeploymentResult,
  AppRuntimeRegistry,
  AppSnapshot,
  DeployAppOptions,
} from '@nocobase/app-host';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import {
  assertReleaseArtifactChecksum,
  resolveReleaseArtifactDirectory,
} from './artifact-integrity.js';
import type { HubApplication, HubDeployment, HubRelease } from './types.ts';
import { HubDomainError } from './store.ts';

export interface LocalHostDeploymentRequest {
  application: HubApplication;
  release: HubRelease;
  deployment: HubDeployment;
  runtimeSecret?: string;
}

export interface LocalHostAdapterOptions {
  registry?: AppRuntimeRegistry;
  releaseRoot?: string;
  appAuthSecret?: string;
}

export class LocalHostAdapter {
  private readonly registry?: AppRuntimeRegistry;
  private readonly releaseRoot?: string;
  private readonly appAuthSecret?: string;

  constructor(options: LocalHostAdapterOptions = {}) {
    this.registry = options.registry;
    this.releaseRoot = options.releaseRoot
      ? path.resolve(options.releaseRoot)
      : undefined;
    this.appAuthSecret = options.appAuthSecret;
  }

  available(): boolean {
    return Boolean(this.registry);
  }

  async deploy(
    request: LocalHostDeploymentRequest,
  ): Promise<AppDeploymentResult> {
    const registry = this.registry;
    if (!registry) {
      throw new HubDomainError(
        'HOST_UNAVAILABLE',
        'The local App Host is unavailable.',
        {
          status: 503,
          retryable: true,
        },
      );
    }

    const target = await this.createTarget(
      request.application,
      request.release,
    );
    const previousReleaseId = request.deployment.previousReleaseId;
    if (
      previousReleaseId &&
      !registry.snapshot(target.id) &&
      registry.definition(target.id)?.release?.releaseId === previousReleaseId
    ) {
      await registry.ensureActive(target.id);
    }

    const options: DeployAppOptions = {
      target,
      operationId: request.deployment.id,
      expectedCurrentReleaseId: previousReleaseId,
      readiness: STRICT_JSON_READINESS,
      runtimeConfig: this.runtimeConfig(request.runtimeSecret),
      reason: `Hub deployment ${request.deployment.id}`,
    };
    return registry.deploy(target.id, options);
  }

  async restore(
    application: HubApplication,
    release: HubRelease,
    runtimeSecret?: string,
  ): Promise<AppDeploymentResult> {
    const registry = this.registry;
    if (!registry) {
      throw new HubDomainError(
        'HOST_UNAVAILABLE',
        'The local App Host is unavailable.',
        { status: 503, retryable: true },
      );
    }
    const current = registry.snapshot(application.slug);
    if (current?.releaseId === release.id) {
      return {
        id: application.slug,
        operationId: `recovery-${release.id}`,
        previousReleaseId: release.id,
        activeReleaseId: release.id,
        changed: false,
        app: current,
      };
    }
    const target = await this.createTarget(application, release);
    return registry.deploy(target.id, {
      target,
      operationId: `recovery-${release.id}`,
      expectedCurrentReleaseId: current?.releaseId ?? null,
      readiness: STRICT_JSON_READINESS,
      runtimeConfig: this.runtimeConfig(runtimeSecret),
      reason: `Restore Hub active release ${release.id}`,
    });
  }

  getRuntime(application: HubApplication): AppSnapshot | undefined {
    return this.registry?.snapshot(application.slug);
  }

  async prepare(
    application: HubApplication,
    release: HubRelease,
    runtimeSecret: string,
    enabled: boolean,
  ): Promise<AppDefinition> {
    const registry = this.requireRegistry();
    const target = {
      ...(await this.createTarget(application, release)),
      enabled,
    };
    return registry.configureInactive(target.id, {
      target,
      runtimeConfig: { authSecret: runtimeSecret },
    });
  }

  async start(
    application: HubApplication,
    release: HubRelease,
    runtimeSecret: string,
    operationId: string,
  ): Promise<AppDeploymentResult> {
    const registry = this.requireRegistry();
    const target = await this.createTarget(application, release);
    return registry.deploy(target.id, {
      target,
      operationId,
      expectedCurrentReleaseId: registry.snapshot(target.id)?.releaseId ?? null,
      runtimeConfig: { authSecret: runtimeSecret },
      readiness: STRICT_JSON_READINESS,
      reason: `Start Hub application ${application.id}`,
    });
  }

  async restart(
    application: HubApplication,
    release: HubRelease,
    runtimeSecret: string,
    operationId: string,
  ): Promise<AppDeploymentResult> {
    const registry = this.requireRegistry();
    const target = await this.createTarget(application, release);
    return registry.deploy(target.id, {
      target,
      operationId,
      expectedCurrentReleaseId: registry.snapshot(target.id)?.releaseId ?? null,
      runtimeConfig: { authSecret: runtimeSecret },
      readiness: STRICT_JSON_READINESS,
      reason: `Restart Hub application ${application.id}`,
    });
  }

  async deactivate(
    application: HubApplication,
    release: HubRelease,
    runtimeSecret?: string,
  ): Promise<AppDefinition> {
    const registry = this.requireRegistry();
    const target = await this.createTarget(application, release);
    const runtimeConfig = this.runtimeConfig(runtimeSecret);
    if (!registry.definition(target.id)) {
      return registry.configureInactive(target.id, {
        target: { ...target, enabled: false },
        runtimeConfig: runtimeConfig ?? null,
      });
    }
    return registry.deactivate(target.id, {
      target: { ...target, enabled: false },
      runtimeConfig,
      reason: `Hub stopped application ${application.id}`,
    });
  }

  async evict(application: HubApplication): Promise<boolean> {
    return this.requireRegistry().evict(application.slug, {
      reason: `Hub evicted application ${application.id}`,
    });
  }

  async unregister(application: HubApplication): Promise<boolean> {
    return this.requireRegistry().unregister(application.slug, {
      reason: `Hub archived application ${application.id}`,
    });
  }

  private async createTarget(
    application: HubApplication,
    release: HubRelease,
  ): Promise<AppDefinition> {
    const releaseDir = this.resolveReleaseDirectory(application, release);
    const serverEntrypoint =
      manifestString(release.manifest, ['server', 'entrypoint']) ??
      'dist/server/embedded.js';
    const clientDirectory =
      manifestString(release.manifest, ['client', 'rootDir']) ?? 'dist/client';
    const serverPath = resolveInside(releaseDir, serverEntrypoint);
    const clientPath = resolveInside(releaseDir, clientDirectory);
    await assertFile(serverPath, 'RELEASE_SERVER_ENTRYPOINT_MISSING');
    await assertReleaseArtifactChecksum(releaseDir, release.checksum);
    const hasClient = await isDirectory(clientPath);
    const current = this.registry?.definition(application.slug);
    const healthPath =
      manifestString(release.manifest, ['server', 'healthPath']) ??
      manifestString(release.manifest, ['healthPath']) ??
      current?.healthPath ??
      '/healthz';

    return {
      ...(current ?? {}),
      id: application.slug,
      appName: application.slug,
      basePath:
        manifestString(release.manifest, ['basePath']) ??
        `/${application.slug}`,
      enabled: true,
      backend: current?.backend ?? 'in-process',
      configVersion: current?.configVersion ?? 'v1',
      isolation: current?.isolation ?? 'in-process',
      tier: current?.tier ?? 'warm',
      desiredVersion: release.version,
      rootDir: releaseDir,
      dataDir: path.join(
        this.releaseRoot ?? path.dirname(releaseDir),
        '.runtime',
        application.slug,
      ),
      client: hasClient
        ? {
            rootDir: clientPath,
            index: 'index.html',
            assetsDir: path.join(clientPath, 'assets'),
          }
        : undefined,
      server: {
        rootDir: releaseDir,
        entrypoint: serverEntrypoint,
        healthPath,
      },
      code: {
        version: release.version,
        rootDir: releaseDir,
        entrypoint: serverEntrypoint,
        checksum: release.checksum,
      },
      release: {
        releaseId: release.id,
        version: release.version,
        rootDir: releaseDir,
        entrypoint: serverEntrypoint,
        checksum: release.checksum,
        releaseDir,
      },
      healthPath,
    };
  }

  private resolveReleaseDirectory(
    application: HubApplication,
    release: HubRelease,
  ): string {
    return resolveReleaseArtifactDirectory({
      releaseRoot: this.releaseRoot,
      applicationId: application.id,
      storageKey: release.storageKey,
    });
  }

  private requireRegistry(): AppRuntimeRegistry {
    if (!this.registry) {
      throw new HubDomainError(
        'HOST_UNAVAILABLE',
        'The local App Host is unavailable.',
        { status: 503, retryable: true },
      );
    }
    return this.registry;
  }

  private runtimeConfig(
    runtimeSecret: string | undefined,
  ): Readonly<Record<string, unknown>> | undefined {
    const authSecret = runtimeSecret ?? this.appAuthSecret;
    return authSecret ? { authSecret } : undefined;
  }
}

const STRICT_JSON_READINESS: NonNullable<DeployAppOptions['readiness']> = {
  timeoutMs: 2_000,
  intervalMs: 100,
  expect: {
    contentType: 'application/json',
    json: { ok: true },
  },
};

function manifestString(
  manifest: Record<string, unknown>,
  pathSegments: string[],
): string | undefined {
  let value: unknown = manifest;
  for (const segment of pathSegments) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return undefined;
    value = (value as Record<string, unknown>)[segment];
  }
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function resolveInside(root: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new HubDomainError(
      'INVALID_RELEASE_PATH',
      'Release paths must be relative.',
      {
        status: 422,
      },
    );
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (
    resolved !== resolvedRoot &&
    !resolved.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new HubDomainError(
      'INVALID_RELEASE_PATH',
      'Release path escapes its artifact root.',
      {
        status: 422,
      },
    );
  }
  return resolved;
}

async function assertFile(filePath: string, code: string): Promise<void> {
  try {
    if ((await stat(filePath)).isFile()) return;
  } catch {
    // Mapped to a stable domain error below.
  }
  throw new HubDomainError(
    code,
    'The release server entrypoint does not exist.',
    {
      status: 422,
    },
  );
}

async function isDirectory(directoryPath: string): Promise<boolean> {
  try {
    return (await stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}
