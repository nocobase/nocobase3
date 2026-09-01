export type DeploymentStatus =
  | 'queued'
  | 'preparing'
  | 'activating'
  | 'checking'
  | 'switching'
  | 'draining'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type DeploymentType = 'deploy' | 'rollback' | 'redeploy';

export interface ApplicationOption {
  readonly id: string;
  readonly name: string;
}

export interface DeploymentFailure {
  readonly code: string;
  readonly title: string;
  readonly message: string;
}

export interface DeploymentRecord {
  readonly id: string;
  readonly displayId: string;
  readonly applicationId: string;
  readonly applicationName: string;
  readonly type: DeploymentType;
  readonly status: DeploymentStatus;
  readonly environment: string;
  readonly previousRelease: string | null;
  readonly targetRelease: string;
  readonly requestedBy: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly failure?: DeploymentFailure;
}

export interface DeploymentEvent {
  readonly id: string;
  readonly stage: DeploymentStatus;
  readonly status: 'pending' | 'running' | 'succeeded' | 'failed';
  readonly message: string;
  readonly createdAt: string;
  readonly detail: string;
}

export interface DeploymentFilters {
  readonly search: string;
  readonly applicationId: string;
  readonly status: string;
  readonly type: string;
  readonly requestedBy: string;
  readonly from: string;
  readonly to: string;
  readonly sort: DeploymentSort;
}

export type DeploymentSort =
  | '-createdAt'
  | 'createdAt'
  | '-startedAt'
  | 'startedAt'
  | '-finishedAt'
  | 'finishedAt';

export type AuditResult = 'success' | 'failure' | 'denied';
export type AuditSource = 'web' | 'agent' | 'system';

export interface AuditClientMetadata {
  readonly name: string;
  readonly credentialId: string | null;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface AuditRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly actorEmail: string | null;
  readonly applicationId: string | null;
  readonly applicationName: string;
  readonly action: string;
  readonly result: AuditResult;
  readonly source: AuditSource;
  readonly resource: string;
  readonly resourceId: string | null;
  readonly requestId: string;
  readonly client: AuditClientMetadata;
  readonly details: unknown;
}

export interface AuditFilters {
  readonly search: string;
  readonly applicationId: string;
  readonly action: string;
  readonly result: string;
  readonly source: string;
  readonly actor: string;
  readonly resource: string;
  readonly resourceId: string;
  readonly from: string;
  readonly to: string;
}

export interface DeploymentProgress {
  readonly percent: number;
  readonly step: number;
}

export const APPLICATION_OPTIONS: readonly ApplicationOption[] = [
  { id: 'app-wms', name: 'Warehouse Management' },
  { id: 'app-crm', name: 'Customer Relationship Management' },
  { id: 'app-analytics', name: 'Analytics Workspace' },
];

export const DEPLOYMENT_STATUSES: readonly DeploymentStatus[] = [
  'queued',
  'preparing',
  'activating',
  'checking',
  'switching',
  'draining',
  'succeeded',
  'failed',
  'cancelled',
];

export const ACTIVE_DEPLOYMENT_SEQUENCE: readonly DeploymentStatus[] = [
  'queued',
  'preparing',
  'activating',
  'checking',
  'switching',
  'draining',
  'succeeded',
];

export const DEPLOYMENT_FIXTURES: readonly DeploymentRecord[] = [
  {
    id: 'deploy-1042',
    displayId: 'DEP-1042',
    applicationId: 'app-wms',
    applicationName: 'Warehouse Management',
    type: 'deploy',
    status: 'succeeded',
    environment: 'Production',
    previousRelease: '1.3.2',
    targetRelease: '1.4.0',
    requestedBy: 'Avery Chen',
    createdAt: '2026-08-31T08:26:00.000Z',
    startedAt: '2026-08-31T08:26:08.000Z',
    finishedAt: '2026-08-31T08:28:41.000Z',
  },
  {
    id: 'deploy-1041',
    displayId: 'DEP-1041',
    applicationId: 'app-crm',
    applicationName: 'Customer Relationship Management',
    type: 'deploy',
    status: 'failed',
    environment: 'Production',
    previousRelease: '2.7.0',
    targetRelease: '2.8.0',
    requestedBy: 'Jordan Lee',
    createdAt: '2026-08-30T15:02:00.000Z',
    startedAt: '2026-08-30T15:02:12.000Z',
    finishedAt: '2026-08-30T15:03:29.000Z',
    failure: {
      code: 'HEALTH_CHECK_FAILED',
      title: 'Readiness check failed',
      message:
        'The candidate runtime did not become ready before the safety timeout. Traffic remained on release 2.7.0.',
    },
  },
  {
    id: 'deploy-1040',
    displayId: 'DEP-1040',
    applicationId: 'app-analytics',
    applicationName: 'Analytics Workspace',
    type: 'redeploy',
    status: 'checking',
    environment: 'Production',
    previousRelease: '0.9.5',
    targetRelease: '0.9.5',
    requestedBy: 'Hub Agent',
    createdAt: '2026-08-30T11:47:00.000Z',
    startedAt: '2026-08-30T11:47:05.000Z',
    finishedAt: null,
  },
  {
    id: 'deploy-1039',
    displayId: 'DEP-1039',
    applicationId: 'app-wms',
    applicationName: 'Warehouse Management',
    type: 'rollback',
    status: 'succeeded',
    environment: 'Production',
    previousRelease: '1.4.0-rc.2',
    targetRelease: '1.3.2',
    requestedBy: 'Avery Chen',
    createdAt: '2026-08-29T09:18:00.000Z',
    startedAt: '2026-08-29T09:18:04.000Z',
    finishedAt: '2026-08-29T09:19:33.000Z',
  },
  {
    id: 'deploy-1038',
    displayId: 'DEP-1038',
    applicationId: 'app-analytics',
    applicationName: 'Analytics Workspace',
    type: 'deploy',
    status: 'failed',
    environment: 'Production',
    previousRelease: '0.9.4',
    targetRelease: '0.9.5',
    requestedBy: 'Morgan Diaz',
    createdAt: '2026-08-27T06:38:00.000Z',
    startedAt: '2026-08-27T06:38:04.000Z',
    finishedAt: '2026-08-27T06:39:10.000Z',
    failure: {
      code: 'ACTIVATION_FAILED',
      title: 'Runtime activation failed',
      message:
        'The runtime exited while loading the application bundle. No traffic was switched.',
    },
  },
  {
    id: 'deploy-1037',
    displayId: 'DEP-1037',
    applicationId: 'app-crm',
    applicationName: 'Customer Relationship Management',
    type: 'redeploy',
    status: 'cancelled',
    environment: 'Production',
    previousRelease: '2.7.0',
    targetRelease: '2.7.0',
    requestedBy: 'Jordan Lee',
    createdAt: '2026-08-25T13:12:00.000Z',
    startedAt: null,
    finishedAt: '2026-08-25T13:12:40.000Z',
  },
  {
    id: 'deploy-1036',
    displayId: 'DEP-1036',
    applicationId: 'app-wms',
    applicationName: 'Warehouse Management',
    type: 'deploy',
    status: 'succeeded',
    environment: 'Production',
    previousRelease: '1.3.1',
    targetRelease: '1.3.2',
    requestedBy: 'Hub Agent',
    createdAt: '2026-08-22T04:05:00.000Z',
    startedAt: '2026-08-22T04:05:06.000Z',
    finishedAt: '2026-08-22T04:07:51.000Z',
  },
  {
    id: 'deploy-1035',
    displayId: 'DEP-1035',
    applicationId: 'app-analytics',
    applicationName: 'Analytics Workspace',
    type: 'deploy',
    status: 'queued',
    environment: 'Staging',
    previousRelease: '0.9.3',
    targetRelease: '0.9.4',
    requestedBy: 'Morgan Diaz',
    createdAt: '2026-08-20T03:11:00.000Z',
    startedAt: null,
    finishedAt: null,
  },
  {
    id: 'deploy-1034',
    displayId: 'DEP-1034',
    applicationId: 'app-crm',
    applicationName: 'Customer Relationship Management',
    type: 'rollback',
    status: 'succeeded',
    environment: 'Production',
    previousRelease: '2.7.1',
    targetRelease: '2.7.0',
    requestedBy: 'Jordan Lee',
    createdAt: '2026-08-18T18:42:00.000Z',
    startedAt: '2026-08-18T18:42:08.000Z',
    finishedAt: '2026-08-18T18:43:54.000Z',
  },
];

export const AUDIT_ACTIONS: readonly string[] = [
  'application.created',
  'application.started',
  'application.stopped',
  'application.updated',
  'deployment.requested',
  'deployment.succeeded',
  'deployment.failed',
  'release.published',
  'permission.updated',
  'member.invited',
  'credential.revoked',
  'settings.updated',
  'runtimeSecret.rotationFailed',
];

export const AUDIT_FIXTURES: readonly AuditRecord[] = [
  {
    id: 'audit-2208',
    createdAt: '2026-08-31T08:31:20.000Z',
    actorId: 'member-avery',
    actorName: 'Avery Chen',
    actorEmail: 'avery@example.test',
    applicationId: 'app-wms',
    applicationName: 'Warehouse Management',
    action: 'application.started',
    result: 'success',
    source: 'web',
    resource: 'application',
    resourceId: 'app-wms',
    requestId: 'req-demo-2208',
    client: {
      name: 'Hub web console',
      credentialId: null,
      ipAddress: '192.0.2.18',
      userAgent: 'Demo Browser',
    },
    details: {
      runtimeId: 'runtime-wms-42',
      release: '1.4.0',
      health: 'healthy',
    },
  },
  {
    id: 'audit-2207',
    createdAt: '2026-08-31T08:26:00.000Z',
    actorId: 'agent-release',
    actorName: 'Release Agent',
    actorEmail: null,
    applicationId: 'app-wms',
    applicationName: 'Warehouse Management',
    action: 'deployment.requested',
    result: 'success',
    source: 'agent',
    resource: 'deployment',
    resourceId: 'deploy-1042',
    requestId: 'req-demo-2207',
    client: {
      name: 'release-bot',
      credentialId: 'credential-demo-4',
      ipAddress: '198.51.100.24',
      userAgent: 'NocoBase Agent/1.0',
    },
    details: {
      targetRelease: '1.4.0',
      type: 'deploy',
      authorization: 'redacted-demo-value',
    },
  },
  {
    id: 'audit-2206',
    createdAt: '2026-08-30T15:06:42.000Z',
    actorId: 'member-jordan',
    actorName: 'Jordan Lee',
    actorEmail: 'jordan@example.test',
    applicationId: 'app-crm',
    applicationName: 'Customer Relationship Management',
    action: 'permission.updated',
    result: 'success',
    source: 'web',
    resource: 'role',
    resourceId: 'role-crm-developer',
    requestId: 'req-demo-2206',
    client: {
      name: 'Hub web console',
      credentialId: null,
      ipAddress: '192.0.2.22',
      userAgent: 'Demo Browser',
    },
    details: { role: 'Developer', permissions: ['read', 'deploy'] },
  },
  {
    id: 'audit-2205',
    createdAt: '2026-08-30T14:44:03.000Z',
    actorId: 'agent-unknown',
    actorName: 'Unrecognized agent',
    actorEmail: null,
    applicationId: 'app-crm',
    applicationName: 'Customer Relationship Management',
    action: 'application.stopped',
    result: 'denied',
    source: 'agent',
    resource: 'application',
    resourceId: 'app-crm',
    requestId: 'req-demo-2205',
    client: {
      name: 'unknown-agent',
      credentialId: 'credential-revoked',
      ipAddress: '203.0.113.9',
      userAgent: 'NocoBase Agent/0.9',
    },
    details: { reason: 'Credential is revoked', token: 'never-display-this' },
  },
  {
    id: 'audit-2204',
    createdAt: '2026-08-30T15:03:29.000Z',
    actorId: 'system',
    actorName: 'Hub system',
    actorEmail: null,
    applicationId: 'app-crm',
    applicationName: 'Customer Relationship Management',
    action: 'deployment.failed',
    result: 'failure',
    source: 'system',
    resource: 'deployment',
    resourceId: 'deploy-1041',
    requestId: 'req-demo-2204',
    client: {
      name: 'deployment orchestrator',
      credentialId: null,
      ipAddress: '127.0.0.1',
      userAgent: 'Hub internal',
    },
    details: {
      code: 'HEALTH_CHECK_FAILED',
      message: 'Candidate runtime did not become ready',
    },
  },
  {
    id: 'audit-2203',
    createdAt: '2026-08-29T11:02:11.000Z',
    actorId: 'member-morgan',
    actorName: 'Morgan Diaz',
    actorEmail: 'morgan@example.test',
    applicationId: null,
    applicationName: 'Hub',
    action: 'member.invited',
    result: 'success',
    source: 'web',
    resource: 'invitation',
    resourceId: 'invite-demo-9',
    requestId: 'req-demo-2203',
    client: {
      name: 'Hub web console',
      credentialId: null,
      ipAddress: '192.0.2.31',
      userAgent: 'Demo Browser',
    },
    details: { role: 'Viewer', expiresInHours: 72 },
  },
  {
    id: 'audit-2202',
    createdAt: '2026-08-28T07:18:05.000Z',
    actorId: 'member-avery',
    actorName: 'Avery Chen',
    actorEmail: 'avery@example.test',
    applicationId: 'app-analytics',
    applicationName: 'Analytics Workspace',
    action: 'release.published',
    result: 'success',
    source: 'web',
    resource: 'release',
    resourceId: 'release-analytics-095',
    requestId: 'req-demo-2202',
    client: {
      name: 'Hub web console',
      credentialId: null,
      ipAddress: '192.0.2.18',
      userAgent: 'Demo Browser',
    },
    details: { version: '0.9.5', checksum: 'sha256:demo' },
  },
  {
    id: 'audit-2201',
    createdAt: '2026-08-27T12:33:48.000Z',
    actorId: 'member-jordan',
    actorName: 'Jordan Lee',
    actorEmail: 'jordan@example.test',
    applicationId: null,
    applicationName: 'Hub',
    action: 'settings.updated',
    result: 'success',
    source: 'web',
    resource: 'settings',
    resourceId: 'runtime-policy',
    requestId: 'req-demo-2201',
    client: {
      name: 'Hub web console',
      credentialId: null,
      ipAddress: '192.0.2.22',
      userAgent: 'Demo Browser',
    },
    details: { idleTimeoutMinutes: 30, password: 'never-display-this' },
  },
  {
    id: 'audit-2200',
    createdAt: '2026-08-26T06:58:00.000Z',
    actorId: 'member-morgan',
    actorName: 'Morgan Diaz',
    actorEmail: 'morgan@example.test',
    applicationId: 'app-wms',
    applicationName: 'Warehouse Management',
    action: 'credential.revoked',
    result: 'success',
    source: 'web',
    resource: 'credential',
    resourceId: 'credential-demo-2',
    requestId: 'req-demo-2200',
    client: {
      name: 'Hub web console',
      credentialId: null,
      ipAddress: '192.0.2.31',
      userAgent: 'Demo Browser',
    },
    details: { reason: 'Rotation completed', cookie: 'never-display-this' },
  },
  {
    id: 'audit-2199',
    createdAt: '2026-08-25T10:22:01.000Z',
    actorId: 'system',
    actorName: 'Hub system',
    actorEmail: null,
    applicationId: 'app-analytics',
    applicationName: 'Analytics Workspace',
    action: 'runtimeSecret.rotationFailed',
    result: 'failure',
    source: 'system',
    resource: 'runtimeSecret',
    resourceId: 'secret-analytics-runtime',
    requestId: 'req-demo-2199',
    client: {
      name: 'secret rotation worker',
      credentialId: null,
      ipAddress: '127.0.0.1',
      userAgent: 'Hub internal',
    },
    details: { code: 'HOST_UNAVAILABLE', retriable: true },
  },
];

export function cloneDeploymentFixtures(): DeploymentRecord[] {
  return DEPLOYMENT_FIXTURES.map((deployment) => ({
    ...deployment,
    failure: deployment.failure ? { ...deployment.failure } : undefined,
  }));
}

export function cloneAuditFixtures(): AuditRecord[] {
  return AUDIT_FIXTURES.map((record) => ({
    ...record,
    client: { ...record.client },
    details: cloneJsonValue(record.details),
  }));
}

export function filterDeployments(
  deployments: readonly DeploymentRecord[],
  filters: DeploymentFilters,
): DeploymentRecord[] {
  const search = normalize(filters.search);
  const requester = normalize(filters.requestedBy);
  const from = parseDateBoundary(filters.from, false);
  const to = parseDateBoundary(filters.to, true);

  return deployments
    .filter((deployment) => {
      const searchable = normalize(
        [
          deployment.displayId,
          deployment.applicationName,
          deployment.targetRelease,
          deployment.previousRelease ?? '',
          deployment.requestedBy,
        ].join(' '),
      );
      const createdAt = Date.parse(deployment.createdAt);
      return (
        (!search || searchable.includes(search)) &&
        (filters.applicationId === 'all' ||
          deployment.applicationId === filters.applicationId) &&
        (filters.status === 'all' || deployment.status === filters.status) &&
        (filters.type === 'all' || deployment.type === filters.type) &&
        (!requester || normalize(deployment.requestedBy).includes(requester)) &&
        (from === null || createdAt >= from) &&
        (to === null || createdAt <= to)
      );
    })
    .sort((left, right) => compareDeploymentDates(left, right, filters.sort));
}

export function filterAuditRecords(
  records: readonly AuditRecord[],
  filters: AuditFilters,
): AuditRecord[] {
  const search = normalize(filters.search);
  const actor = normalize(filters.actor);
  const resource = normalize(filters.resource);
  const resourceId = normalize(filters.resourceId);
  const from = parseDateBoundary(filters.from, false);
  const to = parseDateBoundary(filters.to, true);

  return records.filter((record) => {
    const searchable = normalize(
      [
        record.actorName,
        record.actorEmail ?? '',
        record.applicationName,
        record.action,
        record.resource,
        record.resourceId ?? '',
        record.requestId,
      ].join(' '),
    );
    const createdAt = Date.parse(record.createdAt);
    return (
      (!search || searchable.includes(search)) &&
      (filters.applicationId === 'all' ||
        record.applicationId === filters.applicationId) &&
      (filters.action === 'all' || record.action === filters.action) &&
      (filters.result === 'all' || record.result === filters.result) &&
      (filters.source === 'all' || record.source === filters.source) &&
      (!actor ||
        normalize(
          `${record.actorId} ${record.actorName} ${record.actorEmail ?? ''}`,
        ).includes(actor)) &&
      (!resource || normalize(record.resource).includes(resource)) &&
      (!resourceId ||
        normalize(record.resourceId ?? '').includes(resourceId)) &&
      (from === null || createdAt >= from) &&
      (to === null || createdAt <= to)
    );
  });
}

export function getDeploymentProgress(
  status: DeploymentStatus,
): DeploymentProgress {
  if (status === 'cancelled') return { percent: 0, step: 0 };
  if (status === 'failed') return { percent: 50, step: 3 };
  const step = Math.max(0, ACTIVE_DEPLOYMENT_SEQUENCE.indexOf(status));
  const percent = Math.round(
    (step / (ACTIVE_DEPLOYMENT_SEQUENCE.length - 1)) * 100,
  );
  return { percent, step };
}

export function nextDeploymentStatus(
  status: DeploymentStatus,
): DeploymentStatus | null {
  const current = ACTIVE_DEPLOYMENT_SEQUENCE.indexOf(status);
  if (current < 0 || current >= ACTIVE_DEPLOYMENT_SEQUENCE.length - 1) {
    return null;
  }
  return ACTIVE_DEPLOYMENT_SEQUENCE[current + 1] ?? null;
}

export function createDeploymentEvents(
  deployment: DeploymentRecord,
): DeploymentEvent[] {
  const startedAt = Date.parse(deployment.startedAt ?? deployment.createdAt);

  if (deployment.status === 'cancelled') {
    return [
      {
        id: `${deployment.id}-event-1`,
        stage: 'cancelled',
        status: 'failed',
        message: eventMessage('cancelled', false),
        createdAt: deployment.finishedAt ?? deployment.createdAt,
        detail: eventDetail('cancelled', false),
      },
    ];
  }

  if (deployment.status === 'failed') {
    const failedStage =
      deployment.failure?.code === 'ACTIVATION_FAILED'
        ? 'activating'
        : 'checking';
    const failedIndex = ACTIVE_DEPLOYMENT_SEQUENCE.indexOf(failedStage);
    const completed = ACTIVE_DEPLOYMENT_SEQUENCE.slice(0, failedIndex).map(
      (stage, index): DeploymentEvent => ({
        id: `${deployment.id}-event-${index + 1}`,
        stage,
        status: 'succeeded',
        message: eventMessage(stage, false),
        createdAt: new Date(startedAt + index * 21_000).toISOString(),
        detail: eventDetail(stage, false),
      }),
    );
    return [
      ...completed,
      {
        id: `${deployment.id}-event-${completed.length + 1}`,
        stage: 'failed',
        status: 'failed',
        message: deployment.failure?.title ?? eventMessage('failed', false),
        createdAt:
          deployment.finishedAt ??
          new Date(startedAt + completed.length * 21_000).toISOString(),
        detail: deployment.failure?.message ?? eventDetail('failed', false),
      },
    ];
  }

  const terminalIndex = Math.max(
    0,
    ACTIVE_DEPLOYMENT_SEQUENCE.indexOf(deployment.status),
  );
  return ACTIVE_DEPLOYMENT_SEQUENCE.slice(0, terminalIndex + 1).map(
    (stage, index) => {
      return {
        id: `${deployment.id}-event-${index + 1}`,
        stage,
        status:
          index === terminalIndex && deployment.status !== 'succeeded'
            ? 'running'
            : 'succeeded',
        message: eventMessage(stage, false),
        createdAt: new Date(startedAt + index * 21_000).toISOString(),
        detail: eventDetail(stage, false),
      };
    },
  );
}

export function createRedeploymentEvent(
  deploymentId: string,
  stage: DeploymentStatus,
  index: number,
): DeploymentEvent {
  return {
    id: `${deploymentId}-local-event-${index + 1}`,
    stage,
    status: stage === 'succeeded' ? 'succeeded' : 'running',
    message: eventMessage(stage, false),
    createdAt: new Date(Date.now()).toISOString(),
    detail: eventDetail(stage, false),
  };
}

export function deploymentCsv(
  deployments: readonly DeploymentRecord[],
): string {
  const rows = deployments.map((deployment) => [
    deployment.displayId,
    deployment.applicationName,
    deployment.type,
    deployment.status,
    deployment.environment,
    deployment.previousRelease ?? '',
    deployment.targetRelease,
    deployment.requestedBy,
    deployment.createdAt,
    deployment.startedAt ?? '',
    deployment.finishedAt ?? '',
  ]);
  return encodeCsv(
    [
      'Deployment',
      'Application',
      'Type',
      'Status',
      'Environment',
      'Previous release',
      'Target release',
      'Requested by',
      'Created at',
      'Started at',
      'Finished at',
    ],
    rows,
  );
}

export function auditCsv(records: readonly AuditRecord[]): string {
  const rows = records.map((record) => [
    record.createdAt,
    record.actorName,
    record.actorEmail ?? '',
    record.applicationName,
    record.action,
    record.resource,
    record.resourceId ?? '',
    record.result,
    record.source,
    record.requestId,
  ]);
  return encodeCsv(
    [
      'Time',
      'Actor',
      'Actor email',
      'Application',
      'Action',
      'Resource',
      'Resource ID',
      'Result',
      'Source',
      'Request ID',
    ],
    rows,
  );
}

export function downloadCsv(filename: string, content: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([`\uFEFF${content}`], {
    type: 'text/csv;charset=utf-8',
  });
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  }
}

export function formatDateTime(value: string | null, locale?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatDuration(
  startedAt: string | null,
  finishedAt: string | null,
): string {
  if (!startedAt) return '—';
  const start = Date.parse(startedAt);
  const finish = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) {
    return '—';
  }
  const seconds = Math.round((finish - start) / 1_000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

export function safeJson(value: unknown): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(redactValue(value, seen, 0), null, 2) ?? '{}';
  } catch {
    return '{}';
  }
}

function compareDeploymentDates(
  left: DeploymentRecord,
  right: DeploymentRecord,
  sort: DeploymentSort,
): number {
  const descending = sort.startsWith('-');
  const field = sort.replace('-', '') as
    'createdAt' | 'startedAt' | 'finishedAt';
  const leftValue = Date.parse(left[field] ?? '') || 0;
  const rightValue = Date.parse(right[field] ?? '') || 0;
  return descending ? rightValue - leftValue : leftValue - rightValue;
}

function parseDateBoundary(value: string, end: boolean): number | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      end ? 23 : 0,
      end ? 59 : 0,
      end ? 59 : 0,
      end ? 999 : 0,
    );
    return Number.isNaN(date.valueOf()) ? null : date.valueOf();
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.valueOf();
}

function eventMessage(stage: DeploymentStatus, failed: boolean): string {
  if (failed) return 'Readiness check failed';
  const messages: Record<DeploymentStatus, string> = {
    queued: 'Deployment accepted',
    preparing: 'Release prepared',
    activating: 'Candidate runtime activated',
    checking: 'Readiness checks completed',
    switching: 'Traffic switched',
    draining: 'Previous runtime drained',
    succeeded: 'Deployment completed',
    failed: 'Deployment failed',
    cancelled: 'Deployment cancelled',
  };
  return messages[stage];
}

function eventDetail(stage: DeploymentStatus, failed: boolean): string {
  if (failed) return 'Candidate runtime did not report a healthy status.';
  const details: Record<DeploymentStatus, string> = {
    queued: 'The local orchestrator queued this operation.',
    preparing: 'The immutable release manifest and checksum were verified.',
    activating: 'A candidate runtime started without receiving traffic.',
    checking: 'Health and readiness probes passed.',
    switching: 'New requests now target the candidate runtime.',
    draining: 'In-flight requests on the previous runtime completed.',
    succeeded: 'The target release is active.',
    failed: 'The operation stopped safely.',
    cancelled: 'The operation was cancelled before activation.',
  };
  return details[stage];
}

function encodeCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function cloneJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as unknown;
  } catch {
    return {};
  }
}

function redactValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (depth > 8) return '[Truncated]';
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => redactValue(item, seen, depth + 1));
  }
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    result[key] = isSensitiveKey(key)
      ? '[REDACTED]'
      : redactValue(child, seen, depth + 1);
  }
  return result;
}

function isSensitiveKey(key: string): boolean {
  return /(authorization|cookie|password|secret|token|api[-_]?key)/i.test(key);
}
