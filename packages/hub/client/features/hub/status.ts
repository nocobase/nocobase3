import type {
  HubApplicationStatus,
  HubDeploymentStatus,
  HubReleaseVerificationStatus,
} from './api';

export type HubStatusVariant =
  'default' | 'secondary' | 'outline' | 'destructive';

const labels: Record<string, string> = {
  active: 'Active',
  archived: 'Archived',
  disabled: 'Disabled',
  pending: 'Pending verification',
  verified: 'Verified',
  rejected: 'Rejected',
  queued: 'Queued',
  preparing: 'Preparing',
  activating: 'Starting runtime',
  checking: 'Checking health',
  switching: 'Switching traffic',
  draining: 'Draining old runtime',
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
  running: 'Running',
  idle: 'Idle',
  starting: 'Starting',
  stopping: 'Stopping',
  stopped: 'Stopped',
  healthy: 'Healthy',
  unhealthy: 'Unhealthy',
  success: 'Success',
  failure: 'Failure',
  denied: 'Denied',
};

type Translate = (key: string, defaultMessage?: string) => string;

export function getStatusLabel(
  value: string | null | undefined,
  translate?: Translate,
): string {
  if (!value) return translate?.('hub.status.unknown', 'Unknown') ?? 'Unknown';
  const fallback =
    labels[value] ??
    value.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return translate?.(`hub.status.${value}`, fallback) ?? fallback;
}

export function getDeploymentTypeLabel(
  value: string | null | undefined,
  translate?: Translate,
): string {
  if (!value) return translate?.('hub.status.unknown', 'Unknown') ?? 'Unknown';
  const fallback = value
    .replace(/[-_]/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
  return translate?.(`hub.deploymentType.${value}`, fallback) ?? fallback;
}

export function getStatusVariant(
  value: string | null | undefined,
): HubStatusVariant {
  switch (value) {
    case 'failed':
    case 'failure':
    case 'unhealthy':
    case 'denied':
    case 'rejected':
    case 'disabled':
      return 'destructive';
    case 'succeeded':
    case 'success':
    case 'healthy':
    case 'running':
    case 'verified':
    case 'active':
      return 'default';
    case 'queued':
    case 'pending':
    case 'preparing':
    case 'starting':
    case 'checking':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function getDeploymentProgress(
  status: HubDeploymentStatus,
  translate?: Translate,
): {
  percent: number;
  label: string;
} {
  const percentages: Record<string, number> = {
    queued: 10,
    preparing: 25,
    activating: 45,
    checking: 60,
    switching: 75,
    draining: 88,
    succeeded: 100,
    failed: 100,
    cancelled: 100,
  };
  return {
    percent: percentages[status] ?? 0,
    label: getStatusLabel(status, translate),
  };
}

export function statusLabelForApplication(value: HubApplicationStatus): string {
  return getStatusLabel(value);
}

export function statusLabelForRelease(
  value: HubReleaseVerificationStatus,
): string {
  return getStatusLabel(value);
}
