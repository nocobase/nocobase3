/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AppRuntimeRegistry } from '../app-registry.ts';
import type { AppHostMode } from '../host-mode.ts';
import type { HostDeploymentReconciler } from './reconciler.ts';
import type {
  ApplyHostSnapshotResult,
  HostCapabilities,
  HostDeploymentSnapshot,
  HostStatus,
} from './types.ts';

export interface HostManagementService {
  applySnapshot(
    snapshot: HostDeploymentSnapshot,
  ): Promise<ApplyHostSnapshotResult>;
  getStatus(): Promise<HostStatus>;
  restartApp(appId: string): Promise<HostStatus>;
  getCapabilities(): Promise<HostCapabilities>;
}

export interface DefaultHostManagementServiceOptions {
  mode: AppHostMode;
  registry: AppRuntimeRegistry;
  reconciler: HostDeploymentReconciler;
}

export class DefaultHostManagementService implements HostManagementService {
  private readonly mode: AppHostMode;
  private readonly registry: AppRuntimeRegistry;
  private readonly reconciler: HostDeploymentReconciler;

  constructor(options: DefaultHostManagementServiceOptions) {
    this.mode = options.mode;
    this.registry = options.registry;
    this.reconciler = options.reconciler;
  }

  applySnapshot(
    snapshot: HostDeploymentSnapshot,
  ): Promise<ApplyHostSnapshotResult> {
    return this.reconciler.applySnapshot(snapshot);
  }

  async getStatus(): Promise<HostStatus> {
    return this.reconciler.getStatus();
  }

  async restartApp(appId: string): Promise<HostStatus> {
    if (this.registry.isActive(appId)) {
      await this.registry.reload(appId, { reason: 'managed app restart' });
    } else {
      await this.registry.ensureActive(appId);
    }
    return this.reconciler.getStatus();
  }

  async getCapabilities(): Promise<HostCapabilities> {
    return {
      mode: this.mode,
      protocolVersion: 1,
      backends: this.registry
        .backendKinds()
        .filter((backend) => backend !== 'external-service'),
      activationPolicies: ['lazy', 'eager'],
    };
  }
}
