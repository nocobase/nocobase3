export type ApplicationRuntimeState =
  'running' | 'idle' | 'starting' | 'stopping' | 'stopped';

export type ApplicationHealth = 'healthy' | 'degraded' | 'unknown';

export interface HubApplicationRelease {
  readonly id: string;
  readonly version: string;
  readonly commit: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly notes: string;
  readonly size: string;
  pinned: boolean;
  active: boolean;
}

export interface HubApplicationDeployment {
  readonly id: string;
  readonly version: string;
  readonly type: 'deploy' | 'rollback' | 'redeploy';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  readonly actor: string;
  readonly createdAt: string;
}

export interface HubApplicationActivity {
  readonly id: string;
  readonly action: string;
  readonly actor: string;
  readonly result: 'success' | 'failed';
  readonly createdAt: string;
  readonly details: string;
}

export interface HubApplicationAccess {
  readonly id: string;
  readonly memberId: string;
  readonly memberName: string;
  role: 'viewer' | 'operator' | 'administrator';
}

export interface HubApplicationRecord {
  readonly id: string;
  name: string;
  readonly slug: string;
  description: string;
  archived: boolean;
  runtimeState: ApplicationRuntimeState;
  health: ApplicationHealth;
  environment: 'production' | 'staging';
  currentRelease?: string;
  latestRelease?: string;
  updatedAt: string;
  runtimeSecretRotatedAt: string;
  releases: HubApplicationRelease[];
  deployments: HubApplicationDeployment[];
  activity: HubApplicationActivity[];
  access: HubApplicationAccess[];
}

const warehouse: HubApplicationRecord = {
  id: 'warehouse',
  name: 'Warehouse Management',
  slug: 'wms',
  description: 'Inventory, fulfillment, and warehouse operations.',
  archived: false,
  runtimeState: 'stopped',
  health: 'unknown',
  environment: 'production',
  currentRelease: '2.8.1',
  latestRelease: '2.9.0',
  updatedAt: '2026-08-31T09:12:00.000Z',
  runtimeSecretRotatedAt: '2026-08-21T03:20:00.000Z',
  releases: [
    {
      id: 'rel-wms-290',
      version: '2.9.0',
      commit: 'd3a79e1',
      createdAt: '2026-08-31T08:45:00.000Z',
      createdBy: 'Maya Liu',
      notes: 'Improves receiving and cycle-count workflows.',
      size: '18.4 MB',
      pinned: false,
      active: false,
    },
    {
      id: 'rel-wms-281',
      version: '2.8.1',
      commit: '9547fc0',
      createdAt: '2026-08-27T13:20:00.000Z',
      createdBy: 'Maya Liu',
      notes: 'Stabilizes inventory reservation.',
      size: '17.9 MB',
      pinned: true,
      active: true,
    },
  ],
  deployments: [
    {
      id: 'DEP-1042',
      version: '2.8.1',
      type: 'deploy',
      status: 'succeeded',
      actor: 'Maya Liu',
      createdAt: '2026-08-27T13:31:00.000Z',
    },
  ],
  activity: [
    {
      id: 'ACT-WMS-1',
      action: 'application.stopped',
      actor: 'Maya Liu',
      result: 'success',
      createdAt: '2026-08-31T09:12:00.000Z',
      details: 'Runtime was stopped from the Hub.',
    },
    {
      id: 'ACT-WMS-2',
      action: 'release.created',
      actor: 'Maya Liu',
      result: 'success',
      createdAt: '2026-08-31T08:45:00.000Z',
      details: 'Release 2.9.0 was published.',
    },
  ],
  access: [
    {
      id: 'access-wms-1',
      memberId: 'member-1',
      memberName: 'Maya Liu',
      role: 'administrator',
    },
  ],
};

const crm: HubApplicationRecord = {
  id: 'crm',
  name: 'Customer Relationship Management',
  slug: 'crm',
  description: 'Sales pipelines, customer success, and account operations.',
  archived: false,
  runtimeState: 'running',
  health: 'healthy',
  environment: 'production',
  currentRelease: '1.9.2',
  latestRelease: '2.0.0',
  updatedAt: '2026-08-31T07:40:00.000Z',
  runtimeSecretRotatedAt: '2026-08-18T06:30:00.000Z',
  releases: [
    {
      id: 'rel-crm-200',
      version: '2.0.0',
      commit: 'f0ac762',
      createdAt: '2026-08-30T12:20:00.000Z',
      createdBy: 'Alex Kim',
      notes: 'Adds account scoring and new pipeline views.',
      size: '21.1 MB',
      pinned: false,
      active: false,
    },
    {
      id: 'rel-crm-192',
      version: '1.9.2',
      commit: '29d2ae0',
      createdAt: '2026-08-24T06:15:00.000Z',
      createdBy: 'Alex Kim',
      notes: 'Fixes pipeline activity ordering.',
      size: '20.7 MB',
      pinned: true,
      active: true,
    },
  ],
  deployments: [
    {
      id: 'DEP-1038',
      version: '1.9.2',
      type: 'deploy',
      status: 'succeeded',
      actor: 'Alex Kim',
      createdAt: '2026-08-24T06:25:00.000Z',
    },
  ],
  activity: [
    {
      id: 'ACT-CRM-1',
      action: 'application.started',
      actor: 'Alex Kim',
      result: 'success',
      createdAt: '2026-08-31T07:40:00.000Z',
      details: 'Runtime health checks passed.',
    },
  ],
  access: [
    {
      id: 'access-crm-1',
      memberId: 'member-1',
      memberName: 'Maya Liu',
      role: 'administrator',
    },
  ],
};

const analytics: HubApplicationRecord = {
  id: 'analytics',
  name: 'Analytics Studio',
  slug: 'analytics',
  description: 'Operational dashboards and scheduled reporting.',
  archived: false,
  runtimeState: 'idle',
  health: 'degraded',
  environment: 'staging',
  currentRelease: '1.3.2',
  latestRelease: '1.4.0',
  updatedAt: '2026-08-30T16:05:00.000Z',
  runtimeSecretRotatedAt: '2026-08-12T02:10:00.000Z',
  releases: [
    {
      id: 'rel-analytics-140',
      version: '1.4.0',
      commit: '7e27b08',
      createdAt: '2026-08-30T16:05:00.000Z',
      createdBy: 'Maya Liu',
      notes: 'Adds cohort reports and faster dashboard loading.',
      size: '15.6 MB',
      pinned: false,
      active: false,
    },
    {
      id: 'rel-analytics-132',
      version: '1.3.2',
      commit: 'bc981d2',
      createdAt: '2026-08-20T11:45:00.000Z',
      createdBy: 'Maya Liu',
      notes: 'Fixes report export formatting.',
      size: '15.2 MB',
      pinned: true,
      active: true,
    },
  ],
  deployments: [
    {
      id: 'DEP-1033',
      version: '1.3.2',
      type: 'deploy',
      status: 'succeeded',
      actor: 'Maya Liu',
      createdAt: '2026-08-20T12:00:00.000Z',
    },
  ],
  activity: [
    {
      id: 'ACT-ANALYTICS-1',
      action: 'release.created',
      actor: 'Maya Liu',
      result: 'success',
      createdAt: '2026-08-30T16:05:00.000Z',
      details: 'Release 1.4.0 was published.',
    },
  ],
  access: [
    {
      id: 'access-analytics-1',
      memberId: 'member-1',
      memberName: 'Maya Liu',
      role: 'administrator',
    },
  ],
};

const fieldService: HubApplicationRecord = {
  id: 'field-service',
  name: 'Field Service',
  slug: 'field-service',
  description: 'Dispatch, work orders, and technician schedules.',
  archived: false,
  runtimeState: 'running',
  health: 'healthy',
  environment: 'production',
  currentRelease: '0.9.5',
  latestRelease: '0.9.5',
  updatedAt: '2026-08-29T10:30:00.000Z',
  runtimeSecretRotatedAt: '2026-08-09T01:15:00.000Z',
  releases: [
    {
      id: 'rel-field-095',
      version: '0.9.5',
      commit: '5ac930a',
      createdAt: '2026-08-29T10:10:00.000Z',
      createdBy: 'Lin Chen',
      notes: 'Improves offline work-order synchronization.',
      size: '13.8 MB',
      pinned: false,
      active: true,
    },
  ],
  deployments: [],
  activity: [],
  access: [],
};

const initialApplications: HubApplicationRecord[] = [
  warehouse,
  crm,
  analytics,
  fieldService,
];

export function createApplicationFixtures(): HubApplicationRecord[] {
  return structuredClone(initialApplications);
}

export function createApplicationFixture(
  applicationId: string,
): HubApplicationRecord | undefined {
  const application = initialApplications.find(
    (candidate) => candidate.id === applicationId,
  );
  return application ? structuredClone(application) : undefined;
}

export function createActivity(
  action: string,
  details: string,
): HubApplicationActivity {
  return {
    id: `ACT-LOCAL-${globalThis.crypto.randomUUID()}`,
    action,
    actor: 'Current administrator',
    result: 'success',
    createdAt: new Date().toISOString(),
    details,
  };
}

export function createDeployment(
  version: string,
  type: HubApplicationDeployment['type'],
): HubApplicationDeployment {
  return {
    id: `DEP-LOCAL-${globalThis.crypto.randomUUID()}`,
    version,
    type,
    status: 'succeeded',
    actor: 'Current administrator',
    createdAt: new Date().toISOString(),
  };
}
