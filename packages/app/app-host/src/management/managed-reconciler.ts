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
import type { AppVolumeManager } from '../deployment/volume-manager.ts';
import path from 'node:path';
import type {
  ApplyDeploymentSetResult,
  HostDeploymentSet,
  HostDeploymentSpec,
  HostDeploymentStatus,
  HostStatus,
} from './types.ts';

export interface ManagedReconcilerOptions {
  registry: AppRuntimeRegistry;
  artifactResolver: ArtifactResolver;
  volumes: AppVolumeManager;
}

export class ManagedReconciler {
  private readonly registry: AppRuntimeRegistry;
  private readonly artifactResolver: ArtifactResolver;
  private readonly volumes: AppVolumeManager;
  private statuses = new Map<string, HostDeploymentStatus>();
  private desiredRevision = 0;
  private reconciledRevision = 0;
  private lastSetPayload: string | null = null;
  private applyPromise: Promise<ApplyDeploymentSetResult> = Promise.resolve({
    accepted: false,
    status: {
      mode: 'managed',
      ready: false,
      desiredRevision: 0,
      reconciledRevision: 0,
      deployments: [],
    },
  });

  constructor(options: ManagedReconcilerOptions) {
    this.registry = options.registry;
    this.artifactResolver = options.artifactResolver;
    this.volumes = options.volumes;
  }

  applyDeploymentSet(
    deploymentSet: HostDeploymentSet,
  ): Promise<ApplyDeploymentSetResult> {
    const current = this.applyPromise
      .catch(() => undefined)
      .then(() => this.applyDeploymentSetUnlocked(deploymentSet));
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
      mode: 'managed',
      ready:
        this.reconciledRevision > 0 &&
        deployments.every(
          (deployment) =>
            deployment.observedState !== 'failed' || deployment.app !== null,
        ),
      desiredRevision: this.desiredRevision,
      reconciledRevision: this.reconciledRevision,
      deployments,
    };
  }

  private async applyDeploymentSetUnlocked(
    deploymentSet: HostDeploymentSet,
  ): Promise<ApplyDeploymentSetResult> {
    validateDeploymentSet(deploymentSet);
    for (const spec of deploymentSet.deployments) {
      const previous = this.statuses.get(spec.id);
      if (previous && previous.appId !== spec.appId) {
        throw new Error(
          `Deployment "${spec.id}" cannot change app ID from "${previous.appId}" to "${spec.appId}"`,
        );
      }
    }
    const setPayload = JSON.stringify(deploymentSet);
    if (deploymentSet.revision < this.desiredRevision) {
      return { accepted: false, status: this.getStatus() };
    }

    if (
      deploymentSet.revision === this.desiredRevision &&
      this.lastSetPayload !== setPayload
    ) {
      throw new Error(
        `Deployment set revision ${deploymentSet.revision} cannot be changed`,
      );
    }

    const accepted = deploymentSet.revision > this.desiredRevision;
    if (accepted) {
      this.desiredRevision = deploymentSet.revision;
      this.lastSetPayload = setPayload;
      const desiredIds = new Set(
        deploymentSet.deployments.map((spec) => spec.id),
      );
      for (const [id, status] of this.statuses) {
        if (!desiredIds.has(id)) {
          await this.registry.unregister(status.appId, {
            reason: `deployment ${id} removed from deployment set`,
          });
          this.statuses.delete(id);
        }
      }
    }

    for (const spec of deploymentSet.deployments) {
      await this.reconcileDeployment(deploymentSet.revision, spec);
    }
    this.reconciledRevision = deploymentSet.revision;
    return { accepted, status: this.getStatus() };
  }

  private async reconcileDeployment(
    revision: number,
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
        revision,
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
          ? (spec.config.path ?? this.volumes.configPath(spec.appId))
          : undefined;
        const dataDir = await this.volumes.prepareStorageDir(spec.appId);
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
          },
          {
            activate: (spec.activation ?? 'lazy') === 'eager',
            reason: `deployment ${spec.id} revision ${revision}`,
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
        revision,
        app: result.app,
        error: null,
      });
    } catch (error) {
      this.statuses.set(spec.id, {
        id: spec.id,
        appId: spec.appId,
        desiredState: spec.desiredState,
        observedState: 'failed',
        revision,
        app: this.registry.snapshot(spec.appId) ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function validateDeploymentSet(deploymentSet: HostDeploymentSet): void {
  if (!deploymentSet || typeof deploymentSet !== 'object') {
    throw new Error('Deployment set must be an object');
  }
  if (
    !Number.isSafeInteger(deploymentSet.revision) ||
    deploymentSet.revision < 1
  ) {
    throw new Error('Deployment set revision must be a positive safe integer');
  }
  if (!Array.isArray(deploymentSet.deployments)) {
    throw new Error('Deployment set deployments must be an array');
  }
  const deploymentIds = new Set<string>();
  const appIds = new Set<string>();
  const basePaths = new Set<string>();
  for (const spec of deploymentSet.deployments) {
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
        spec.config.provider !== 'file' ||
        (spec.config.path !== undefined &&
          (typeof spec.config.path !== 'string' ||
            !path.isAbsolute(spec.config.path)))
      ) {
        throw new Error(`Invalid file config for deployment "${spec.id}"`);
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
