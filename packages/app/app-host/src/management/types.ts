/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { ArtifactReference } from '../artifact-resolver.ts';
import type { AppSnapshot } from '../app-types.ts';
import type { AppHostMode } from '../host-mode.ts';

export type DeploymentDesiredState = 'running' | 'stopped';
export type AppActivationPolicy = 'lazy' | 'eager';

export interface HostFileConfig {
  provider: 'file';
  path?: string;
  content?: string;
  revision?: string;
}

export interface HostDeploymentSpec {
  id: string;
  appId: string;
  artifact: ArtifactReference;
  desiredState: DeploymentDesiredState;
  backend: 'in-process';
  activation?: AppActivationPolicy;
  basePath?: string;
  config?: HostFileConfig;
}

export interface HostDeploymentSet {
  revision: number;
  deployments: HostDeploymentSpec[];
}

export type DeploymentObservedState =
  'pending' | 'running' | 'stopped' | 'failed';

export interface HostDeploymentStatus {
  id: string;
  appId: string;
  desiredState: DeploymentDesiredState;
  observedState: DeploymentObservedState;
  revision: number;
  cacheHit: boolean | null;
  app: AppSnapshot | null;
  error: string | null;
}

export interface HostStatus {
  mode: AppHostMode;
  ready: boolean;
  desiredRevision: number;
  reconciledRevision: number;
  deployments: HostDeploymentStatus[];
}

export interface ApplyDeploymentSetResult {
  accepted: boolean;
  status: HostStatus;
}
