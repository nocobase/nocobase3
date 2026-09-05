import type {
  HostDeploymentSet,
  HostStatus,
} from '@nocobase/app-host/management';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export type HubObservedState =
  'pending' | 'running' | 'stopped' | 'failed' | 'unknown';
export type HubDeploymentStatus =
  'queued' | 'deploying' | 'succeeded' | 'failed' | 'cancelled';
export type HubDeploymentPhase =
  | 'queued'
  | 'resolving'
  | 'verifying'
  | 'extracting'
  | 'preparing'
  | 'starting'
  | 'health_check'
  | 'switching'
  | 'cleaning'
  | 'completed';

export interface HubAppRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly currentDeploymentId: string | null;
  readonly enabled: boolean;
  readonly basePath: string;
  readonly backend: 'in-process';
  readonly startupMode: 'lazy' | 'eager';
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface HubReleaseRecord {
  readonly id: string;
  readonly appId: string;
  readonly version: string;
  readonly artifactKey: string;
  readonly checksum: string;
  readonly size: number;
  readonly configTemplate: string | null;
  readonly manifest: Record<string, unknown> | null;
  readonly createdAt: Date;
}

export type HubConfigMode = 'file' | 'external';

export interface HubConfigBinding {
  readonly mode: HubConfigMode;
  readonly path?: string;
}

export interface HubDeploymentRecord {
  readonly id: string;
  readonly appId: string;
  readonly releaseId: string;
  readonly kind: 'deploy' | 'rollback';
  readonly rollbackTargetDeploymentId: string | null;
  readonly previousDeploymentId: string | null;
  readonly status: HubDeploymentStatus;
  readonly phase: HubDeploymentPhase;
  readonly config: HubConfigBinding;
  readonly cacheHit: boolean | null;
  readonly hostRevision: number | null;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
}

export interface HubRuntimeStatus {
  readonly hostAvailable: boolean;
  readonly state: HubObservedState;
  readonly version: string | null;
  readonly startedAt: string | null;
  readonly lastAccessedAt: string | null;
  readonly activeRequests: number;
  readonly hostRevision: number | null;
  readonly error: string | null;
}

export interface HubAppSummary {
  readonly app: HubAppRecord;
  readonly runtime: HubRuntimeStatus;
  readonly currentVersion: string | null;
  readonly hasReleases: boolean;
  readonly hasPendingDeployment: boolean;
}

export interface HubAppDetail {
  readonly hasReleases: boolean;
  readonly hasPendingDeployment: boolean;
  readonly currentVersion: string | null;
  readonly app: HubAppRecord;
  readonly deployment: {
    readonly desiredReleaseId: string | null;
    readonly observedReleaseId: string | null;
    readonly desiredState: 'running' | 'stopped';
    readonly observedState: HubObservedState;
    readonly activation: 'lazy' | 'eager';
    readonly basePath: string;
    readonly config: HubConfigBinding;
    readonly error: string | null;
    readonly updatedAt: Date;
  };
  readonly runtime: HubRuntimeStatus;
  readonly hostUrl: string | null;
}

export interface HubDeploymentListItem extends HubDeploymentRecord {
  readonly release: {
    readonly version: string;
    readonly checksum: string;
  } | null;
}

export interface CreateHubAppInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface CreateHubReleaseInput {
  readonly bytes: Uint8Array;
}

export interface HubConfigDocument {
  readonly mode: HubConfigMode;
  readonly content: string | null;
}

export interface SaveHubConfigInput {
  readonly mode: HubConfigMode;
  readonly content?: string;
}

export interface UpdateHubConfigInput {
  readonly content: string;
}

export interface DeployHubAppInput {
  readonly releaseId: string;
  readonly config?: SaveHubConfigInput;
}

export interface RollbackHubAppInput {
  readonly deploymentId: string;
  readonly config?: SaveHubConfigInput;
}

export interface UpdateHubSettingsInput {
  readonly activation: 'lazy' | 'eager';
}

export interface HubService {
  listApps(): Promise<readonly HubAppSummary[]>;
  getApp(appId: string): Promise<HubAppDetail>;
  createApp(input: CreateHubAppInput): Promise<HubAppDetail>;
  listReleases(appId: string): Promise<readonly HubReleaseRecord[]>;
  getRelease(appId: string, releaseId: string): Promise<HubReleaseRecord>;
  createRelease(
    appId: string,
    input: CreateHubReleaseInput,
  ): Promise<HubReleaseRecord>;
  readConfig(appId: string): Promise<HubConfigDocument>;
  updateConfig(
    appId: string,
    input: UpdateHubConfigInput,
  ): Promise<HubConfigDocument>;
  updateSettings(
    appId: string,
    input: UpdateHubSettingsInput,
  ): Promise<HubAppDetail>;
  listDeployments(appId: string): Promise<readonly HubDeploymentListItem[]>;
  getDeployment(
    appId: string,
    deploymentId: string,
  ): Promise<HubDeploymentRecord>;
  deploy(appId: string, input: DeployHubAppInput): Promise<HubDeploymentRecord>;
  rollback(
    appId: string,
    input: RollbackHubAppInput,
  ): Promise<HubDeploymentRecord>;
  refresh(appId: string): Promise<HubAppDetail>;
  start(appId: string): Promise<HubAppDetail>;
  restart(appId: string): Promise<HubAppDetail>;
  stop(appId: string): Promise<HubAppDetail>;
  remove(appId: string): Promise<void>;
  hostStatus(): Promise<HostStatus>;
  restoreDesiredState(): Promise<void>;
  createDeploymentSet(): Promise<HostDeploymentSet>;
  hostUrl(): string | null;
  shutdown(): Promise<void>;
}

export const hubServiceToken: ServiceToken<HubService> =
  createServiceToken<HubService>('@nocobase/app-plugin-hub/service');
