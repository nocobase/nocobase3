import type {
  AppReleaseOverview,
  DeploymentKind,
  ReleaseOverview,
  ReleaseSummary,
} from './types.js';

export interface ReleaseOverviewSummary {
  apps: number;
  releases: number;
  online: number;
  blocked: number;
  rollbackPoints: number;
  awaitingApproval: number;
}

export function getReleaseAction(
  app: AppReleaseOverview,
  release: ReleaseSummary,
): DeploymentKind | null {
  if (release.id === app.activeReleaseId) {
    return null;
  }
  if (!app.activeReleaseId) {
    return 'deploy';
  }

  const active = app.releases.find(
    (candidate) => candidate.id === app.activeReleaseId,
  );
  if (
    active?.createdAt &&
    release.createdAt &&
    Date.parse(release.createdAt) < Date.parse(active.createdAt)
  ) {
    return 'rollback';
  }
  return 'deploy';
}

export function summarizeOverview(
  overview: ReleaseOverview,
): ReleaseOverviewSummary {
  return {
    apps: overview.apps.length,
    releases: overview.apps.reduce(
      (total, app) => total + app.releases.length,
      0,
    ),
    online: overview.apps.filter((app) => app.activeReleaseId).length,
    blocked: overview.deployments.filter((deployment) =>
      isReadinessBlocked(deployment),
    ).length,
    rollbackPoints: overview.apps.reduce(
      (total, app) =>
        total +
        app.releases.filter(
          (release) => getReleaseAction(app, release) === 'rollback',
        ).length,
      0,
    ),
    awaitingApproval:
      overview.approvals?.filter((approval) => approval.status === 'pending')
        .length ?? 0,
  };
}

export function isReadinessBlocked(
  deployment: ReleaseOverview['deployments'][number],
): boolean {
  return (
    deployment.status === 'failed' &&
    deployment.error?.code === 'APP_READINESS_FAILED'
  );
}
