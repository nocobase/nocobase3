/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { ArtifactReference } from '../artifact-resolver.ts';
import type { AppBackendKind, AppSnapshot } from '../app-types.ts';
import type { AppHostMode } from '../host-mode.ts';

export type DeploymentDesiredState = 'running' | 'stopped';
export type AppActivationPolicy = 'lazy' | 'eager';

export interface DeploymentConfigRevision {
  revision: string;
  value: unknown;
}

export interface HostDeploymentSpec {
  id: string;
  appId: string;
  artifact: ArtifactReference;
  desiredState: DeploymentDesiredState;
  backend: 'in-process';
  activation?: AppActivationPolicy;
  basePath?: string;
  config?: DeploymentConfigRevision;
}

export interface HostDeploymentSnapshot {
  generation: number;
  deployments: HostDeploymentSpec[];
}

export type DeploymentObservedState =
  'registered' | 'running' | 'stopped' | 'failed';

export interface HostDeploymentStatus {
  id: string;
  appId: string;
  desiredState: DeploymentDesiredState;
  observedState: DeploymentObservedState;
  generation: number;
  configRevision?: string;
  app: AppSnapshot | null;
  error: string | null;
}

export interface HostStatus {
  mode: AppHostMode;
  ready: boolean;
  desiredGeneration: number;
  reconciledGeneration: number;
  deployments: HostDeploymentStatus[];
}

export interface ApplyHostSnapshotResult {
  accepted: boolean;
  status: HostStatus;
}

export interface HostCapabilities {
  mode: AppHostMode;
  protocolVersion: 1;
  backends: Array<Exclude<AppBackendKind, 'external-service'>>;
  activationPolicies: AppActivationPolicy[];
}
