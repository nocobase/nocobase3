import type {
  HubAppDetail,
  HubAppSummary,
  HubDeploymentRecord,
  HubDeploymentListItem,
  HubReleaseRecord,
} from '../tokens.js';

type AppIdentity = Pick<
  HubAppDetail['app'],
  'id' | 'name' | 'updatedAt' | 'currentDeploymentId'
>;
type Runtime = Pick<HubAppDetail['runtime'], 'hostAvailable' | 'state'>;
interface AppSummaryResponse {
  app: AppIdentity;
  runtime: Runtime;
  currentVersion: string | null;
  hasReleases: boolean;
  hasPendingDeployment: boolean;
}
interface AppDetailResponse extends AppSummaryResponse {
  deployment: Pick<
    HubAppDetail['deployment'],
    | 'desiredReleaseId'
    | 'observedReleaseId'
    | 'observedState'
    | 'activation'
    | 'basePath'
    | 'updatedAt'
  >;
  hostUrl: string | null;
}
type ReleaseResponse = Pick<
  HubReleaseRecord,
  'id' | 'version' | 'checksum' | 'size' | 'createdAt'
> & { hasConfigTemplate: boolean };
type DeploymentResponse = Pick<
  HubDeploymentRecord,
  | 'id'
  | 'releaseId'
  | 'kind'
  | 'status'
  | 'phase'
  | 'cacheHit'
  | 'error'
  | 'createdAt'
> & {
  config: Pick<HubDeploymentRecord['config'], 'mode'>;
};

export function appSummaryResponse(
  value: HubAppSummary | HubAppDetail,
): AppSummaryResponse {
  return {
    app: {
      id: value.app.id,
      name: value.app.name,
      updatedAt: value.app.updatedAt,
      currentDeploymentId: value.app.currentDeploymentId,
    },
    runtime: {
      hostAvailable: value.runtime.hostAvailable,
      state: value.runtime.state,
    },
    currentVersion: value.currentVersion,
    hasReleases: value.hasReleases,
    hasPendingDeployment: value.hasPendingDeployment,
  };
}

export function appDetailResponse(value: HubAppDetail): AppDetailResponse {
  const deployment = value.deployment;
  return {
    ...appSummaryResponse(value),
    deployment: {
      desiredReleaseId: deployment.desiredReleaseId,
      observedReleaseId: deployment.observedReleaseId,
      observedState: deployment.observedState,
      activation: deployment.activation,
      basePath: deployment.basePath,
      updatedAt: deployment.updatedAt,
    },
    hostUrl: value.hostUrl,
  };
}

export function releaseResponse(value: HubReleaseRecord): ReleaseResponse {
  return {
    id: value.id,
    version: value.version,
    checksum: value.checksum,
    size: value.size,
    createdAt: value.createdAt,
    hasConfigTemplate: value.configTemplate !== null,
  };
}

export function deploymentResponse(
  value: HubDeploymentRecord,
): DeploymentResponse {
  return {
    id: value.id,
    releaseId: value.releaseId,
    kind: value.kind,
    status: value.status,
    phase: value.phase,
    cacheHit: value.cacheHit,
    error: value.error,
    createdAt: value.createdAt,
    config: { mode: value.config.mode },
  };
}

export function deploymentListResponse(
  value: HubDeploymentListItem,
): DeploymentResponse & Pick<HubDeploymentListItem, 'release'> {
  return { ...deploymentResponse(value), release: value.release };
}
