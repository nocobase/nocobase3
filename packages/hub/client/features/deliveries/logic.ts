import {
  getReleaseAction,
  isReadinessBlocked,
} from '@nocobase/hub-release-management/client';
import type {
  AppReleaseOverview,
  DeploymentKind,
  DeploymentRecord,
  ReleaseApprovalRecord,
  ReleaseOverview,
  ReleaseSummary,
} from '@nocobase/hub-release-management/types';

export type AgentDeliveryStage =
  | 'ready'
  | 'pending-approval'
  | 'executing'
  | 'online'
  | 'rejected'
  | 'failed'
  | 'historical';

export type DeliveryCheckStatus = 'passed' | 'waiting' | 'failed';

export type AgentDeliveryView =
  'attention' | 'in-progress' | 'online' | 'exceptions' | 'history' | 'all';

export interface AgentDelivery {
  id: string;
  app: AppReleaseOverview;
  release: ReleaseSummary;
  action: DeploymentKind | null;
  stage: AgentDeliveryStage;
  approval: ReleaseApprovalRecord | null;
  deployment: DeploymentRecord | null;
  manifestCheck: DeliveryCheckStatus;
  approvalCheck: DeliveryCheckStatus;
  readinessCheck: DeliveryCheckStatus;
  trafficCheck: DeliveryCheckStatus;
}

export interface AgentDeliverySummary {
  total: number;
  needsAttention: number;
  executing: number;
  online: number;
  failed: number;
}

export function buildAgentDeliveries(
  overview: ReleaseOverview,
): AgentDelivery[] {
  return overview.apps
    .flatMap((app) =>
      app.releases.map((release) => buildAgentDelivery(overview, app, release)),
    )
    .sort(compareDeliveries);
}

export function summarizeAgentDeliveries(
  deliveries: readonly AgentDelivery[],
): AgentDeliverySummary {
  return {
    total: deliveries.length,
    needsAttention: deliveries.filter((delivery) =>
      ['ready', 'pending-approval'].includes(delivery.stage),
    ).length,
    executing: deliveries.filter((delivery) => delivery.stage === 'executing')
      .length,
    online: deliveries.filter((delivery) => delivery.stage === 'online').length,
    failed: deliveries.filter((delivery) =>
      ['rejected', 'failed'].includes(delivery.stage),
    ).length,
  };
}

export function filterAgentDeliveries(
  deliveries: readonly AgentDelivery[],
  view: AgentDeliveryView,
): AgentDelivery[] {
  if (view === 'all') return [...deliveries];
  const stages: Record<
    Exclude<AgentDeliveryView, 'all'>,
    AgentDeliveryStage[]
  > = {
    attention: ['ready', 'pending-approval'],
    'in-progress': ['executing'],
    online: ['online'],
    exceptions: ['failed', 'rejected'],
    history: ['historical'],
  };
  return deliveries.filter((delivery) => stages[view].includes(delivery.stage));
}

function buildAgentDelivery(
  overview: ReleaseOverview,
  app: AppReleaseOverview,
  release: ReleaseSummary,
): AgentDelivery {
  const action = getReleaseAction(app, release);
  const approvals = (overview.approvals ?? [])
    .filter(
      (approval) =>
        approval.appId === app.id && approval.releaseId === release.id,
    )
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  const deployments = overview.deployments
    .filter(
      (deployment) =>
        deployment.appId === app.id && deployment.releaseId === release.id,
    )
    .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
  const approval = approvals[0] ?? null;
  const deployment = deployments[0] ?? null;
  const stage = resolveStage({ app, action, approval, deployment, release });

  return {
    id: `${app.id}:${release.id}`,
    app,
    release,
    action,
    stage,
    approval,
    deployment,
    manifestCheck: 'passed',
    approvalCheck: resolveApprovalCheck(stage, approval),
    readinessCheck: resolveReadinessCheck(stage, deployment),
    trafficCheck: stage === 'online' ? 'passed' : 'waiting',
  };
}

function resolveStage(input: {
  app: AppReleaseOverview;
  release: ReleaseSummary;
  action: DeploymentKind | null;
  approval: ReleaseApprovalRecord | null;
  deployment: DeploymentRecord | null;
}): AgentDeliveryStage {
  if (input.release.id === input.app.activeReleaseId) return 'online';
  if (input.approval?.status === 'pending') return 'pending-approval';
  if (input.approval?.status === 'executing') return 'executing';
  if (input.approval?.status === 'rejected') return 'rejected';
  if (
    input.approval?.status === 'failed' ||
    input.deployment?.status === 'failed'
  ) {
    return 'failed';
  }
  if (input.action === 'rollback') return 'historical';
  return 'ready';
}

function resolveApprovalCheck(
  stage: AgentDeliveryStage,
  approval: ReleaseApprovalRecord | null,
): DeliveryCheckStatus {
  if (stage === 'online') return 'passed';
  if (approval?.status === 'rejected') return 'failed';
  if (
    approval?.status === 'executing' ||
    approval?.status === 'succeeded' ||
    approval?.status === 'failed'
  ) {
    return 'passed';
  }
  return 'waiting';
}

function resolveReadinessCheck(
  stage: AgentDeliveryStage,
  deployment: DeploymentRecord | null,
): DeliveryCheckStatus {
  if (stage === 'online') return 'passed';
  if (deployment?.status === 'failed') return 'failed';
  if (
    deployment &&
    (deployment.status === 'succeeded' || deployment.status === 'unchanged')
  ) {
    return 'passed';
  }
  return 'waiting';
}

function compareDeliveries(left: AgentDelivery, right: AgentDelivery): number {
  const priority: Record<AgentDeliveryStage, number> = {
    'pending-approval': 0,
    ready: 1,
    executing: 2,
    failed: 3,
    rejected: 4,
    online: 5,
    historical: 6,
  };
  const stageDifference = priority[left.stage] - priority[right.stage];
  if (stageDifference !== 0) return stageDifference;
  return (right.release.createdAt ?? '').localeCompare(
    left.release.createdAt ?? '',
  );
}

export function deliveryStageLabel(stage: AgentDeliveryStage): string {
  const labels: Record<AgentDeliveryStage, string> = {
    ready: '待提交审批',
    'pending-approval': '待审批',
    executing: '发布中',
    online: '当前在线',
    rejected: '已驳回',
    failed: '发布失败',
    historical: '历史版本',
  };
  return labels[stage];
}

export function readinessCheckLabel(delivery: AgentDelivery): string {
  if (delivery.readinessCheck === 'passed') return '健康门禁已通过';
  if (delivery.readinessCheck === 'failed') {
    return delivery.deployment && isReadinessBlocked(delivery.deployment)
      ? '健康门禁已拦截'
      : '运行检查未通过';
  }
  return '发布时执行健康门禁';
}
