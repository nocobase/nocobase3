import type { AppConfigSchemaDocument } from '@nocobase/app-server/config';
import type {
  HostDeploymentSet,
  HostStatus,
} from '@nocobase/app-host/management';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

export type HubDesiredState = 'running' | 'stopped';
export type HubObservedState =
  'pending' | 'registered' | 'running' | 'stopped' | 'failed';

export interface HubAppRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
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
  readonly configSchema: AppConfigSchemaDocument;
  readonly configSchemaFormatVersion: number;
  readonly configSchemaDigest: string;
  readonly createdAt: Date;
}

export interface HubFileConfigBinding {
  readonly provider: 'file';
  readonly path?: string;
}

export interface HubDeploymentRecord {
  readonly id: string;
  readonly appId: string;
  readonly desiredReleaseId: string | null;
  readonly observedReleaseId: string | null;
  readonly desiredState: HubDesiredState;
  readonly observedState: HubObservedState;
  readonly observedRevision: number | null;
  readonly basePath: string;
  readonly backend: 'in-process';
  readonly activation: 'lazy' | 'eager';
  readonly config: HubFileConfigBinding;
  readonly error: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface HubAppDetail {
  readonly app: HubAppRecord;
  readonly deployment: HubDeploymentRecord;
  readonly releases: readonly HubReleaseRecord[];
  readonly hostUrl: string | null;
}

export interface CreateHubAppInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface CreateHubReleaseInput {
  readonly version: string;
  readonly bytes: Uint8Array;
}

export interface HubConfigDocument {
  readonly content: Record<string, unknown>;
  readonly releaseId: string | null;
  readonly path: string;
}

export interface SaveHubConfigInput {
  readonly releaseId: string;
  readonly content: Record<string, unknown>;
}

export interface DeployHubAppInput {
  readonly releaseId: string;
  readonly config?: Record<string, unknown>;
}

export interface HubService {
  listApps(): Promise<readonly HubAppDetail[]>;
  getApp(appId: string): Promise<HubAppDetail>;
  createApp(input: CreateHubAppInput): Promise<HubAppDetail>;
  listReleases(appId: string): Promise<readonly HubReleaseRecord[]>;
  getRelease(appId: string, releaseId: string): Promise<HubReleaseRecord>;
  createRelease(
    appId: string,
    input: CreateHubReleaseInput,
  ): Promise<HubReleaseRecord>;
  readConfig(appId: string): Promise<HubConfigDocument>;
  saveConfig(
    appId: string,
    input: SaveHubConfigInput,
  ): Promise<HubConfigDocument>;
  deploy(appId: string, input: DeployHubAppInput): Promise<HubAppDetail>;
  stop(appId: string): Promise<HubAppDetail>;
  restart(appId: string): Promise<HostStatus>;
  hostStatus(): Promise<HostStatus>;
  restoreDesiredState(): Promise<void>;
  createDeploymentSet(): Promise<HostDeploymentSet>;
  hostUrl(): string | null;
  shutdown(): Promise<void>;
}

export const hubServiceToken: ServiceToken<HubService> =
  createServiceToken<HubService>('@nocobase/app-plugin-hub/service');
