export type MemberStatus = 'active' | 'disabled';

export type RoleKey = 'administrator' | 'developer' | 'deployer' | 'viewer';

export type ApplicationId = 'warehouse' | 'crm' | 'analytics';

export interface MemberAccess {
  globalRoles: RoleKey[];
  applicationRoles: Partial<Record<ApplicationId, RoleKey[]>>;
}

export interface HubMember {
  id: string;
  name: string;
  username: string;
  email: string;
  status: MemberStatus;
  lastActiveAt: string;
  access: MemberAccess;
}

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface HubInvitation {
  id: string;
  email: string;
  role: RoleKey;
  scope: 'global' | ApplicationId;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
}

export type CredentialStatus = 'active' | 'expired' | 'revoked';

export interface HubAgentCredential {
  id: string;
  clientId: string;
  name: string;
  scopes: string[];
  applicationScope: 'global' | ApplicationId;
  status: CredentialStatus;
  lastUsedAt: string | null;
}

export interface HubApplication {
  id: ApplicationId;
  name: string;
}

export interface RoleCapability {
  resource: string;
  actions: string[];
}

export interface BuiltInRole {
  key: RoleKey;
  scopes: Array<'global' | 'application'>;
  capabilities: RoleCapability[];
}

const MEMBER_FIXTURES: HubMember[] = [
  {
    id: 'member-avery',
    name: 'Avery Chen',
    username: 'avery.chen',
    email: 'avery.chen@example.test',
    status: 'active',
    lastActiveAt: '2026-08-31T08:34:00.000Z',
    access: {
      globalRoles: ['administrator'],
      applicationRoles: {},
    },
  },
  {
    id: 'member-morgan',
    name: 'Morgan Lee',
    username: 'morgan.lee',
    email: 'morgan.lee@example.test',
    status: 'active',
    lastActiveAt: '2026-08-30T15:12:00.000Z',
    access: {
      globalRoles: [],
      applicationRoles: {
        warehouse: ['developer'],
        crm: ['viewer'],
      },
    },
  },
  {
    id: 'member-taylor',
    name: 'Taylor Brooks',
    username: 'taylor.brooks',
    email: 'taylor.brooks@example.test',
    status: 'active',
    lastActiveAt: '2026-08-29T10:08:00.000Z',
    access: {
      globalRoles: [],
      applicationRoles: { warehouse: ['deployer'] },
    },
  },
  {
    id: 'member-sam',
    name: 'Sam Rivera',
    username: 'sam.rivera',
    email: 'sam.rivera@example.test',
    status: 'disabled',
    lastActiveAt: '2026-08-18T03:45:00.000Z',
    access: {
      globalRoles: [],
      applicationRoles: { analytics: ['viewer'] },
    },
  },
  {
    id: 'member-priya',
    name: 'Priya Singh',
    username: 'priya.singh',
    email: 'priya.singh@example.test',
    status: 'active',
    lastActiveAt: '2026-08-27T07:22:00.000Z',
    access: {
      globalRoles: [],
      applicationRoles: { crm: ['developer'] },
    },
  },
  {
    id: 'member-jordan',
    name: 'Jordan Kim',
    username: 'jordan.kim',
    email: 'jordan.kim@example.test',
    status: 'active',
    lastActiveAt: '2026-08-25T12:19:00.000Z',
    access: {
      globalRoles: [],
      applicationRoles: { warehouse: ['viewer'] },
    },
  },
  {
    id: 'member-chris',
    name: 'Chris Wu',
    username: 'chris.wu',
    email: 'chris.wu@example.test',
    status: 'disabled',
    lastActiveAt: '2026-08-12T01:06:00.000Z',
    access: {
      globalRoles: [],
      applicationRoles: { analytics: ['deployer'] },
    },
  },
];

const INVITATION_FIXTURES: HubInvitation[] = [
  {
    id: 'invite-106',
    email: 'casey.ng@example.test',
    role: 'developer',
    scope: 'warehouse',
    status: 'pending',
    createdAt: '2026-08-31T06:15:00.000Z',
    expiresAt: '2026-09-07T06:15:00.000Z',
  },
  {
    id: 'invite-105',
    email: 'devon.park@example.test',
    role: 'viewer',
    scope: 'global',
    status: 'accepted',
    createdAt: '2026-08-28T09:20:00.000Z',
    expiresAt: '2026-09-04T09:20:00.000Z',
  },
  {
    id: 'invite-104',
    email: 'alexis.ross@example.test',
    role: 'deployer',
    scope: 'crm',
    status: 'expired',
    createdAt: '2026-08-17T13:40:00.000Z',
    expiresAt: '2026-08-24T13:40:00.000Z',
  },
  {
    id: 'invite-103',
    email: 'jamie.lin@example.test',
    role: 'viewer',
    scope: 'analytics',
    status: 'revoked',
    createdAt: '2026-08-15T02:05:00.000Z',
    expiresAt: '2026-08-22T02:05:00.000Z',
  },
  {
    id: 'invite-102',
    email: 'remy.jones@example.test',
    role: 'developer',
    scope: 'crm',
    status: 'pending',
    createdAt: '2026-08-12T04:55:00.000Z',
    expiresAt: '2026-09-11T04:55:00.000Z',
  },
  {
    id: 'invite-101',
    email: 'skyler.martin@example.test',
    role: 'viewer',
    scope: 'warehouse',
    status: 'accepted',
    createdAt: '2026-08-09T11:30:00.000Z',
    expiresAt: '2026-08-16T11:30:00.000Z',
  },
];

const CREDENTIAL_FIXTURES: HubAgentCredential[] = [
  {
    id: 'credential-ci',
    clientId: 'agent_ci_7f39',
    name: 'Release automation',
    scopes: ['releases:write', 'deployments:write'],
    applicationScope: 'global',
    status: 'active',
    lastUsedAt: '2026-08-31T07:52:00.000Z',
  },
  {
    id: 'credential-audit',
    clientId: 'agent_audit_82d1',
    name: 'Audit exporter',
    scopes: ['audit:read'],
    applicationScope: 'global',
    status: 'revoked',
    lastUsedAt: '2026-08-24T16:20:00.000Z',
  },
  {
    id: 'credential-preview',
    clientId: 'agent_preview_41ac',
    name: 'Preview environment',
    scopes: ['applications:read', 'runtime:read'],
    applicationScope: 'warehouse',
    status: 'expired',
    lastUsedAt: '2026-08-19T06:10:00.000Z',
  },
  {
    id: 'credential-ops',
    clientId: 'agent_ops_02ce',
    name: 'Operations archive',
    scopes: ['deployments:read'],
    applicationScope: 'crm',
    status: 'revoked',
    lastUsedAt: '2026-08-08T09:15:00.000Z',
  },
  {
    id: 'credential-report',
    clientId: 'agent_report_a183',
    name: 'Weekly reporting',
    scopes: ['applications:read', 'audit:read'],
    applicationScope: 'analytics',
    status: 'expired',
    lastUsedAt: null,
  },
  {
    id: 'credential-legacy',
    clientId: 'agent_legacy_f110',
    name: 'Legacy publisher',
    scopes: ['releases:write'],
    applicationScope: 'warehouse',
    status: 'revoked',
    lastUsedAt: '2026-07-22T10:00:00.000Z',
  },
];

export const HUB_APPLICATIONS: HubApplication[] = [
  { id: 'warehouse', name: 'Warehouse Management' },
  { id: 'crm', name: 'Customer Relationship Management' },
  { id: 'analytics', name: 'Analytics Workspace' },
];

export const BUILT_IN_ROLES: BuiltInRole[] = [
  {
    key: 'administrator',
    scopes: ['global'],
    capabilities: [
      { resource: 'applications', actions: ['create', 'read', 'update'] },
      { resource: 'members', actions: ['invite', 'manage'] },
      { resource: 'audit', actions: ['read', 'export'] },
    ],
  },
  {
    key: 'developer',
    scopes: ['application'],
    capabilities: [
      { resource: 'applications', actions: ['read'] },
      { resource: 'releases', actions: ['create', 'read', 'publish'] },
      { resource: 'deployments', actions: ['read'] },
    ],
  },
  {
    key: 'deployer',
    scopes: ['application'],
    capabilities: [
      { resource: 'deployments', actions: ['create', 'read', 'redeploy'] },
      { resource: 'runtime', actions: ['start', 'stop', 'restart'] },
      { resource: 'releases', actions: ['read'] },
    ],
  },
  {
    key: 'viewer',
    scopes: ['global', 'application'],
    capabilities: [
      { resource: 'applications', actions: ['read'] },
      { resource: 'deployments', actions: ['read'] },
      { resource: 'activity', actions: ['read'] },
    ],
  },
];

function cloneAccess(access: MemberAccess): MemberAccess {
  return {
    globalRoles: [...access.globalRoles],
    applicationRoles: Object.fromEntries(
      Object.entries(access.applicationRoles).map(([applicationId, roles]) => [
        applicationId,
        [...roles],
      ]),
    ),
  };
}

export function createMemberFixtures(): HubMember[] {
  return MEMBER_FIXTURES.map((member) => ({
    ...member,
    access: cloneAccess(member.access),
  }));
}

export function createInvitationFixtures(): HubInvitation[] {
  return INVITATION_FIXTURES.map((invitation) => ({ ...invitation }));
}

export function createCredentialFixtures(): HubAgentCredential[] {
  return CREDENTIAL_FIXTURES.map((credential) => ({
    ...credential,
    scopes: [...credential.scopes],
  }));
}

export function memberRoles(member: HubMember): RoleKey[] {
  return [
    ...new Set([
      ...member.access.globalRoles,
      ...Object.values(member.access.applicationRoles).flat(),
    ]),
  ];
}

export function visibleApplicationCount(member: HubMember): number {
  if (member.access.globalRoles.length > 0) return HUB_APPLICATIONS.length;
  return Object.values(member.access.applicationRoles).filter(
    (roles) => roles.length > 0,
  ).length;
}

export function isValidInvitationEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
