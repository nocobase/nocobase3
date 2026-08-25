import type {
  AppReleaseOverview,
  DeploymentRecord,
} from '@nocobase/hub-release-management/types';

export function displayAppName(appId: string): string {
  return appId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function appStateLabel(state: string): string {
  if (state === 'active') return '运行中';
  if (state === 'starting') return '启动中';
  if (state === 'stopping') return '停止中';
  if (state === 'stopped') return '已停止';
  if (state === 'idle') return '已发布 · 访问时启动';
  if (state === 'not-deployed') return '未发布';
  if (state === 'failed') return '运行异常';
  return state || '未知';
}

export function appAccessDisabledReason(
  app: AppReleaseOverview | undefined,
): string | undefined {
  if (!app) return undefined;
  if (app.desiredState === 'stopped') return 'App 已停止';
  if (app.runtimeState === 'starting') return 'App 启动中';
  if (app.runtimeState === 'stopping') return 'App 停止中';
  return undefined;
}

export function isAppDeployed(app: AppReleaseOverview): boolean {
  return Boolean(app.activeReleaseId);
}

export function latestDeployment(
  deployments: DeploymentRecord[],
  appId: string,
): DeploymentRecord | undefined {
  return deployments
    .filter((deployment) => deployment.appId === appId)
    .sort(
      (left, right) =>
        Date.parse(right.requestedAt) - Date.parse(left.requestedAt),
    )[0];
}

export function pendingReleaseCount(app: AppReleaseOverview): number {
  return app.releases.filter((release) => release.id !== app.activeReleaseId)
    .length;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
