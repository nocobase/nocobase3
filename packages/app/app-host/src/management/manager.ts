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
import type { DeploymentCatalog } from '../deployment/catalog.ts';
import {
  StandaloneReconciler,
  type StandaloneReconcileResult,
} from '../deployment/standalone-reconciler.ts';
import type { AppHostMode } from '../host-mode.ts';
import { ManagedReconciler } from './managed-reconciler.ts';
import type {
  ApplyDeploymentSetResult,
  HostDeploymentSet,
  HostStatus,
} from './types.ts';

export interface HostManagementService {
  applyDeploymentSet(
    deploymentSet: HostDeploymentSet,
  ): Promise<ApplyDeploymentSetResult>;
  getStatus(): Promise<HostStatus>;
  restartApp(appId: string): Promise<HostStatus>;
}

export interface HostManagerOptions {
  mode: AppHostMode;
  registry: AppRuntimeRegistry;
  deploymentCatalog: DeploymentCatalog;
  artifactResolver: ArtifactResolver;
}

type HostModeState =
  | { mode: 'standalone'; reconciler: StandaloneReconciler }
  | { mode: 'managed'; reconciler: ManagedReconciler };

export class HostManager implements HostManagementService {
  private readonly registry: AppRuntimeRegistry;
  private readonly state: HostModeState;

  constructor(options: HostManagerOptions) {
    this.registry = options.registry;
    this.state =
      options.mode === 'standalone'
        ? {
            mode: 'standalone',
            reconciler: new StandaloneReconciler(
              options.deploymentCatalog,
              options.registry,
            ),
          }
        : {
            mode: 'managed',
            reconciler: new ManagedReconciler({
              registry: options.registry,
              artifactResolver: options.artifactResolver,
              volumes: options.deploymentCatalog.volumes,
            }),
          };
  }

  initialize(): Promise<StandaloneReconcileResult | null> {
    return this.state.mode === 'standalone'
      ? this.state.reconciler.reconcile()
      : Promise.resolve(null);
  }

  rescan(): Promise<StandaloneReconcileResult> {
    if (this.state.mode !== 'standalone') {
      throw new Error('Deployment directory scanning requires standalone mode');
    }
    return this.state.reconciler.reconcile();
  }

  applyDeploymentSet(
    deploymentSet: HostDeploymentSet,
  ): Promise<ApplyDeploymentSetResult> {
    if (this.state.mode !== 'managed') {
      throw new Error('Deployment sets require managed host mode');
    }
    return this.state.reconciler.applyDeploymentSet(deploymentSet);
  }

  async getStatus(): Promise<HostStatus> {
    if (this.state.mode === 'managed') {
      return this.state.reconciler.getStatus();
    }
    return {
      mode: 'standalone',
      ready: true,
      desiredRevision: 0,
      reconciledRevision: 0,
      deployments: [],
    };
  }

  async restartApp(appId: string): Promise<HostStatus> {
    if (!this.registry.isActive(appId)) {
      throw new Error(`App "${appId}" is not running`);
    }
    await this.registry.reload(appId, { reason: 'host app restart' });
    return this.getStatus();
  }
}
