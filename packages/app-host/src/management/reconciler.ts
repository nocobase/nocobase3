/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { ArtifactResolver } from '../artifact-resolver.ts';
import type { AppRuntimeRegistry } from '../app-registry.ts';
import type { AppHostMode } from '../host-mode.ts';
import type { ConfigMaterializer } from './config-materializer.ts';
import type {
  ApplyHostSnapshotResult,
  HostDeploymentSnapshot,
  HostDeploymentSpec,
  HostDeploymentStatus,
  HostStatus,
} from './types.ts';

export interface HostDeploymentReconcilerOptions {
  mode: AppHostMode;
  registry: AppRuntimeRegistry;
  artifactResolver: ArtifactResolver;
  configMaterializer: ConfigMaterializer;
}

export class HostDeploymentReconciler {
  private readonly mode: AppHostMode;
  private readonly registry: AppRuntimeRegistry;
  private readonly artifactResolver: ArtifactResolver;
  private readonly configMaterializer: ConfigMaterializer;
  private statuses = new Map<string, HostDeploymentStatus>();
  private desiredGeneration = 0;
  private reconciledGeneration = 0;
  private lastSnapshotPayload: string | null = null;
  private applyPromise: Promise<ApplyHostSnapshotResult> = Promise.resolve({
    accepted: false,
    status: {
      mode: 'managed',
      ready: false,
      desiredGeneration: 0,
      reconciledGeneration: 0,
      deployments: [],
    },
  });

  constructor(options: HostDeploymentReconcilerOptions) {
    this.mode = options.mode;
    this.registry = options.registry;
    this.artifactResolver = options.artifactResolver;
    this.configMaterializer = options.configMaterializer;
  }

  applySnapshot(
    snapshot: HostDeploymentSnapshot,
  ): Promise<ApplyHostSnapshotResult> {
    const current = this.applyPromise
      .catch(() => undefined)
      .then(() => this.applySnapshotUnlocked(snapshot));
    this.applyPromise = current;
    return current;
  }

  getStatus(): HostStatus {
    const deployments = [...this.statuses.values()]
      .map((status) => {
        const app = this.registry.snapshot(status.appId) ?? null;
        return {
          ...status,
          app,
          observedState:
            status.observedState === 'failed'
              ? 'failed'
              : app
                ? 'running'
                : status.observedState,
        } satisfies HostDeploymentStatus;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    return {
      mode: this.mode,
      ready:
        this.mode === 'standalone' ||
        (this.reconciledGeneration > 0 &&
          deployments.every(
            (deployment) =>
              deployment.observedState !== 'failed' || deployment.app !== null,
          )),
      desiredGeneration: this.desiredGeneration,
      reconciledGeneration: this.reconciledGeneration,
      deployments,
    };
  }

  private async applySnapshotUnlocked(
    snapshot: HostDeploymentSnapshot,
  ): Promise<ApplyHostSnapshotResult> {
    if (this.mode !== 'managed') {
      throw new Error('Deployment snapshots require managed host mode');
    }
    validateSnapshot(snapshot);
    for (const spec of snapshot.deployments) {
      const previous = this.statuses.get(spec.id);
      if (previous && previous.appId !== spec.appId) {
        throw new Error(
          `Deployment "${spec.id}" cannot change app ID from "${previous.appId}" to "${spec.appId}"`,
        );
      }
    }
    const snapshotPayload = JSON.stringify(snapshot);
    if (snapshot.generation < this.desiredGeneration) {
      return { accepted: false, status: this.getStatus() };
    }

    if (
      snapshot.generation === this.desiredGeneration &&
      this.lastSnapshotPayload !== snapshotPayload
    ) {
      throw new Error(
        `Snapshot generation ${snapshot.generation} cannot be changed`,
      );
    }

    const accepted = snapshot.generation > this.desiredGeneration;
    if (accepted) {
      this.desiredGeneration = snapshot.generation;
      this.lastSnapshotPayload = snapshotPayload;
      const desiredIds = new Set(snapshot.deployments.map((spec) => spec.id));
      for (const [id, status] of this.statuses) {
        if (!desiredIds.has(id)) {
          await this.registry.unregister(status.appId, {
            reason: `deployment ${id} removed from snapshot`,
          });
          this.statuses.delete(id);
        }
      }
    }

    for (const spec of snapshot.deployments) {
      await this.reconcileDeployment(snapshot.generation, spec);
    }
    this.reconciledGeneration = snapshot.generation;
    return { accepted, status: this.getStatus() };
  }

  private async reconcileDeployment(
    generation: number,
    spec: HostDeploymentSpec,
  ): Promise<void> {
    if (spec.desiredState === 'stopped') {
      await this.registry.unregister(spec.appId, {
        reason: `deployment ${spec.id} stopped`,
      });
      this.statuses.set(spec.id, {
        id: spec.id,
        appId: spec.appId,
        desiredState: spec.desiredState,
        observedState: 'stopped',
        generation,
        configRevision: spec.config?.revision,
        app: null,
        error: null,
      });
      return;
    }

    try {
      if (!this.registry.backendKinds().includes(spec.backend)) {
        throw new Error(
          `App backend "${spec.backend}" is not available on this host`,
        );
      }
      const artifact = await this.artifactResolver.resolve(spec.artifact);
      let result;
      try {
        const configPath = spec.config
          ? await this.configMaterializer.materialize(spec.appId, spec.config)
          : artifact.definition.configPath;
        const dataDir = await this.configMaterializer.prepareStorageDir(
          spec.appId,
        );
        result = await this.registry.replaceDefinition(
          {
            ...artifact.definition,
            id: spec.appId,
            appName: spec.appId,
            basePath: spec.basePath ?? artifact.definition.basePath,
            backend: spec.backend,
            isolation: spec.backend,
            dataDir,
            configPath,
            configVersion:
              spec.config?.revision ?? artifact.definition.configVersion,
          },
          {
            activate: (spec.activation ?? 'lazy') === 'eager',
            reason: `deployment ${spec.id} generation ${generation}`,
          },
        );
        await artifact.commit();
      } catch (error) {
        await artifact.rollback();
        throw error;
      }
      this.statuses.set(spec.id, {
        id: spec.id,
        appId: spec.appId,
        desiredState: spec.desiredState,
        observedState: result.app ? 'running' : 'registered',
        generation,
        configRevision: spec.config?.revision,
        app: result.app,
        error: null,
      });
    } catch (error) {
      this.statuses.set(spec.id, {
        id: spec.id,
        appId: spec.appId,
        desiredState: spec.desiredState,
        observedState: 'failed',
        generation,
        configRevision: spec.config?.revision,
        app: this.registry.snapshot(spec.appId) ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function validateSnapshot(snapshot: HostDeploymentSnapshot): void {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Deployment snapshot must be an object');
  }
  if (!Number.isSafeInteger(snapshot.generation) || snapshot.generation < 1) {
    throw new Error('Snapshot generation must be a positive safe integer');
  }
  if (!Array.isArray(snapshot.deployments)) {
    throw new Error('Snapshot deployments must be an array');
  }
  const deploymentIds = new Set<string>();
  const appIds = new Set<string>();
  const basePaths = new Set<string>();
  for (const spec of snapshot.deployments) {
    if (!spec || typeof spec !== 'object') {
      throw new Error('Deployment must be an object');
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(spec.id)) {
      throw new Error(`Invalid deployment ID "${spec.id}"`);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(spec.appId)) {
      throw new Error(`Invalid app ID "${spec.appId}"`);
    }
    if (spec.desiredState !== 'running' && spec.desiredState !== 'stopped') {
      throw new Error(
        `Invalid desired state "${String(spec.desiredState)}" for deployment "${spec.id}"`,
      );
    }
    if (spec.backend !== 'in-process') {
      throw new Error(
        `App backend "${String(spec.backend)}" is not supported by this host version`,
      );
    }
    if (
      spec.activation !== undefined &&
      spec.activation !== 'lazy' &&
      spec.activation !== 'eager'
    ) {
      throw new Error(
        `Invalid activation policy "${String(spec.activation)}" for deployment "${spec.id}"`,
      );
    }
    const restartPolicy = (
      spec as HostDeploymentSpec & { restartPolicy?: unknown }
    ).restartPolicy;
    if (restartPolicy !== undefined) {
      throw new Error(
        `Restart policy is not supported by the in-process backend for deployment "${spec.id}"`,
      );
    }
    if (
      !spec.artifact ||
      typeof spec.artifact !== 'object' ||
      typeof spec.artifact.key !== 'string' ||
      typeof spec.artifact.appId !== 'string' ||
      typeof spec.artifact.version !== 'string' ||
      typeof spec.artifact.checksum !== 'string'
    ) {
      throw new Error(`Invalid artifact reference for deployment "${spec.id}"`);
    }
    if (spec.config !== undefined) {
      if (
        !spec.config ||
        typeof spec.config !== 'object' ||
        typeof spec.config.revision !== 'string'
      ) {
        throw new Error(`Invalid config revision for deployment "${spec.id}"`);
      }
    }
    if (deploymentIds.has(spec.id)) {
      throw new Error(`Duplicate deployment ID "${spec.id}"`);
    }
    if (appIds.has(spec.appId)) {
      throw new Error(`Duplicate app ID "${spec.appId}"`);
    }
    deploymentIds.add(spec.id);
    appIds.add(spec.appId);
    if (spec.artifact.appId !== spec.appId) {
      throw new Error(
        `Deployment "${spec.id}" artifact app ID must match "${spec.appId}"`,
      );
    }
    const basePath = spec.basePath ?? `/${spec.appId}`;
    if (!/^\/[a-zA-Z0-9_-]+$/.test(basePath) || basePath.startsWith('/__')) {
      throw new Error(`Invalid deployment base path "${basePath}"`);
    }
    if (basePaths.has(basePath)) {
      throw new Error(`Duplicate deployment base path "${basePath}"`);
    }
    basePaths.add(basePath);
  }
}
