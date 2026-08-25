import {
  Authorization,
  DatabaseAuthorizationStore,
  type AuthorizationPlan,
  type FilterAst,
} from '@nocobase/authorization';
import type { DatabaseManager } from '@nocobase/database';
import type { Knex } from 'knex';

import {
  CRM_RESOURCES,
  CrmServiceError,
  type CrmApiResourceName,
  type CrmResourceName,
} from './crm.js';

export const CRM_ROLE_KEYS = [
  'crm-admin',
  'crm-sales-manager',
  'crm-sales',
] as const;

export type CrmRoleKey = (typeof CRM_ROLE_KEYS)[number];
export type CrmMemberStatus = 'active' | 'disabled';
export type CrmPermissionScope = 'all' | 'own';
export type CrmPermissionCapability = 'read' | 'create' | 'update' | 'destroy';

export interface CrmRoleSummary {
  key: CrmRoleKey;
  title: string;
  description: string;
  memberCount: number;
  system: boolean;
}

export interface CrmMemberSummary {
  id: string;
  name: string;
  username: string | null;
  email: string;
  status: CrmMemberStatus;
  roleKey: CrmRoleKey;
  roleTitle: string;
  createdAt: string;
}

export interface CrmPermissionRow {
  resource: CrmResourceName;
  resourceTitle: string;
  capabilities: CrmPermissionCapability[];
  scope: CrmPermissionScope;
  supportsOwnScope: boolean;
}

export interface CrmRolePermissionSettings {
  role: CrmRoleSummary;
  permissions: CrmPermissionRow[];
}

export interface CrmMemberUpdate {
  status: CrmMemberStatus;
  roleKey: CrmRoleKey;
}

export interface CrmAclResponse {
  role: CrmRoleKey;
  roles: CrmRoleKey[];
  resources: string[];
  actions: Record<string, Record<string, never>>;
  snippets: string[];
  allowConfigure: boolean;
}

export interface CrmAccessService {
  assertActiveMember(userId: string): Promise<void>;
  assertCanConfigure(userId: string): Promise<void>;
  ensureMember(userId: string): Promise<void>;
  hasUserIdentity(email: string, username: string): Promise<boolean>;
  listMembers(): Promise<CrmMemberSummary[]>;
  listRoles(): Promise<CrmRoleSummary[]>;
  addMember(
    userId: string,
    roleKey: CrmRoleKey,
    actorId: string,
  ): Promise<void>;
  removeProvisionedUser(userId: string): Promise<void>;
  updateMember(
    userId: string,
    input: CrmMemberUpdate,
    actorId: string,
  ): Promise<void>;
  getRolePermissions(roleKey: CrmRoleKey): Promise<CrmRolePermissionSettings>;
  updateRolePermissions(
    roleKey: CrmRoleKey,
    permissions: readonly CrmPermissionRow[],
    actorId: string,
  ): Promise<CrmRolePermissionSettings>;
  usesOwnScope(userId: string, resource: CrmResourceName): Promise<boolean>;
  plan(
    userId: string,
    resource: CrmApiResourceName,
    action: string,
    record?: Readonly<Record<string, unknown>>,
  ): Promise<AuthorizationPlan>;
  permissionsFor(userId: string): Promise<CrmAclResponse>;
}

const actionNames = [
  'list',
  'get',
  'create',
  'update',
  'destroy',
  'query',
] as const;
const ownerScopedResources = new Set<CrmResourceName>([
  'agent_crm_leads',
  'agent_crm_opportunities',
  'agent_crm_activities',
]);
const resourceTitles: Record<CrmResourceName, string> = {
  agent_crm_accounts: '客户档案',
  agent_crm_contacts: '联系人',
  agent_crm_leads: '销售线索',
  agent_crm_opportunities: '商机管道',
  agent_crm_activities: '跟进任务',
};

interface IdentifierRow {
  id: string;
}

interface MemberRow {
  status: unknown;
  userId: string;
}

interface MemberListRow {
  id: string;
  name: string;
  username: string | null;
  email: string;
  createdAt: string | Date;
  status: unknown;
  roleKey: unknown;
  roleTitle: string;
}

interface RoleListRow {
  key: unknown;
  title: string;
  description: string | null;
  memberCount: number | string | null;
}

interface StoredPermissionRow {
  id: string;
  resource: unknown;
  actions: unknown;
}

interface RoleKeyRow {
  key: unknown;
}

export function createCrmAccessService(
  database: DatabaseManager,
): CrmAccessService {
  return new DatabaseCrmAccessService(database);
}

class DatabaseCrmAccessService implements CrmAccessService {
  private readonly authorization: Authorization;

  constructor(private readonly database: DatabaseManager) {
    this.authorization = new Authorization({
      store: new DatabaseAuthorizationStore(database.connection()),
    });
    for (const resource of CRM_RESOURCES) {
      this.authorization.resources.register({
        name: resource,
        actions: actionNames,
        fields: {
          id: { type: 'scalar' },
          ownerId: { type: 'scalar' },
        },
        attributes: ownerScopedResources.has(resource)
          ? { identifier: 'id', owner: 'ownerId' }
          : { identifier: 'id' },
      });
    }
    this.authorization.resources.register({
      name: 'user',
      actions: ['list', 'get'],
      fields: { id: { type: 'scalar' } },
      attributes: { identifier: 'id' },
    });
  }

  async ensureMember(userId: string): Promise<void> {
    const knex = await this.knex();
    const existing = await knex<MemberRow>('crmAppMembers')
      .where({ userId })
      .first();
    if (existing) return;

    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      const current = await transaction<MemberRow>('crmAppMembers')
        .where({ userId })
        .first();
      if (current) return;
      const memberCount = Number(
        (
          await transaction('crmAppMembers')
            .count<{ count: number | string }>({ count: '*' })
            .first()
        )?.count ?? 0,
      );
      if (memberCount > 0) {
        throw new CrmServiceError('当前账号还不是 CRM 成员。', {
          status: 403,
          code: 'CRM_MEMBERSHIP_REQUIRED',
        });
      }
      await this.insertMember(transaction, userId, 'crm-admin');
    });
  }

  async assertActiveMember(userId: string): Promise<void> {
    await this.ensureMember(userId);
    const knex = await this.knex();
    const member = await knex<MemberRow>('crmAppMembers')
      .select('status')
      .where({ userId })
      .first();
    if (member?.status !== 'active') {
      throw new CrmServiceError('当前成员已停用。', {
        status: 403,
        code: 'CRM_MEMBER_DISABLED',
      });
    }
  }

  async assertCanConfigure(userId: string): Promise<void> {
    await this.assertActiveMember(userId);
    if (!(await this.userHasRole(userId, 'crm-admin'))) {
      throw new CrmServiceError('只有 App 管理员可以修改成员和权限。', {
        status: 403,
        code: 'CRM_SETTINGS_FORBIDDEN',
      });
    }
  }

  async hasUserIdentity(email: string, username: string): Promise<boolean> {
    const knex = await this.knex();
    return Boolean(
      await knex('user')
        .select('id')
        .whereRaw('lower(email) = ?', [email.trim().toLowerCase()])
        .orWhereRaw('lower(username) = ?', [username.trim().toLowerCase()])
        .first(),
    );
  }

  async listMembers(): Promise<CrmMemberSummary[]> {
    const knex = await this.knex();
    const rows = (await knex('crmAppMembers as member')
      .innerJoin('user', 'user.id', 'member.userId')
      .innerJoin(
        'authzAssignments as assignment',
        'assignment.subjectId',
        'member.userId',
      )
      .innerJoin(
        'authzPermissionSets as role',
        'role.id',
        'assignment.targetId',
      )
      .where('assignment.subjectType', 'user')
      .where('assignment.targetType', 'permissionSet')
      .whereIn('role.key', CRM_ROLE_KEYS)
      .select([
        'user.id',
        'user.name',
        'user.username',
        'user.email',
        'user.createdAt',
        'member.status',
        'role.key as roleKey',
        'role.title as roleTitle',
      ])
      .orderBy('user.createdAt', 'asc')) as MemberListRow[];
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      username: row.username == null ? null : String(row.username),
      email: String(row.email),
      status: parseMemberStatus(row.status),
      roleKey: parseRoleKey(row.roleKey),
      roleTitle: String(row.roleTitle),
      createdAt: toIsoString(row.createdAt),
    }));
  }

  async listRoles(): Promise<CrmRoleSummary[]> {
    const knex = await this.knex();
    const rows = (await knex('authzPermissionSets as role')
      .leftJoin(
        'authzAssignments as assignment',
        'assignment.targetId',
        'role.id',
      )
      .whereIn('role.key', CRM_ROLE_KEYS)
      .groupBy(['role.id', 'role.key', 'role.title', 'role.description'])
      .select([
        'role.key',
        'role.title',
        'role.description',
        knex.raw(
          'sum(case when assignment.subjectType = ? and assignment.targetType = ? then 1 else 0 end) as memberCount',
          ['user', 'permissionSet'],
        ),
      ])) as RoleListRow[];
    const order = new Map(CRM_ROLE_KEYS.map((key, index) => [key, index]));
    return rows
      .map((row) => {
        const key = parseRoleKey(row.key);
        return {
          key,
          title: String(row.title),
          description: String(row.description ?? ''),
          memberCount: Number(row.memberCount ?? 0),
          system: key === 'crm-admin',
        };
      })
      .sort(
        (left, right) =>
          (order.get(left.key) ?? 99) - (order.get(right.key) ?? 99),
      );
  }

  async addMember(
    userId: string,
    roleKey: CrmRoleKey,
    actorId: string,
  ): Promise<void> {
    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      await this.insertMember(transaction, userId, roleKey);
      await this.writeAudit(transaction, {
        event: 'crm.member.created',
        actorId,
        resourceId: userId,
        details: { roleKey },
      });
    });
  }

  async removeProvisionedUser(userId: string): Promise<void> {
    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      await transaction('authzAssignments')
        .where({ subjectType: 'user', subjectId: userId })
        .delete();
      await transaction('crmAppMembers').where({ userId }).delete();
      await transaction('session').where({ userId }).delete();
      await transaction('account').where({ userId }).delete();
      await transaction('user').where({ id: userId }).delete();
    });
  }

  async updateMember(
    userId: string,
    input: CrmMemberUpdate,
    actorId: string,
  ): Promise<void> {
    const roleKey = parseRoleKey(input.roleKey);
    const status = parseMemberStatus(input.status);
    const currentRole = await this.getUserRole(userId);
    if (!currentRole) throw memberNotFound(userId);
    const knex = await this.knex();
    const currentMember = await knex<MemberRow>('crmAppMembers')
      .select('status')
      .where({ userId })
      .first();
    if (!currentMember) throw memberNotFound(userId);
    const currentStatus = parseMemberStatus(currentMember.status);
    if (currentRole === roleKey && currentStatus === status) return;
    if (userId === actorId && status === 'disabled') {
      throw new CrmServiceError('不能停用当前登录账号。', {
        status: 409,
        code: 'CRM_MEMBER_SELF_DISABLE',
      });
    }
    if (
      currentRole === 'crm-admin' &&
      (roleKey !== 'crm-admin' || status === 'disabled') &&
      (await this.activeAdminCount()) <= 1
    ) {
      throw new CrmServiceError('必须至少保留一名启用状态的管理员。', {
        status: 409,
        code: 'CRM_LAST_ADMIN_REQUIRED',
      });
    }

    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      const now = new Date().toISOString();
      await transaction('crmAppMembers')
        .where({ userId })
        .update({ status, updatedAt: now });
      await transaction('authzAssignments')
        .where({ subjectType: 'user', subjectId: userId })
        .delete();
      await this.insertAssignment(transaction, userId, roleKey, now);
      await this.writeAudit(transaction, {
        event: 'crm.member.updated',
        actorId,
        resourceId: userId,
        details: { status, roleKey },
      });
    });
  }

  async getRolePermissions(
    roleKey: CrmRoleKey,
  ): Promise<CrmRolePermissionSettings> {
    const role = (await this.listRoles()).find((item) => item.key === roleKey);
    if (!role) throw roleNotFound(roleKey);
    const knex = await this.knex();
    const rows = (await knex('authzObjectPermissions as permission')
      .innerJoin(
        'authzPermissionSets as role',
        'role.id',
        'permission.permissionSetId',
      )
      .where('role.key', roleKey)
      .whereIn('permission.resource', CRM_RESOURCES)
      .select([
        'permission.id',
        'permission.resource',
        'permission.actions',
      ])) as StoredPermissionRow[];
    const byResource = new Map(
      rows.map((row) => [
        String(row.resource),
        parseStoredActions(row.actions),
      ]),
    );
    return {
      role,
      permissions: CRM_RESOURCES.map((resource) =>
        toPermissionRow(resource, byResource.get(resource) ?? []),
      ),
    };
  }

  async updateRolePermissions(
    roleKey: CrmRoleKey,
    permissions: readonly CrmPermissionRow[],
    actorId: string,
  ): Promise<CrmRolePermissionSettings> {
    if (roleKey === 'crm-admin') {
      throw new CrmServiceError(
        '管理员权限为系统保护项，不能在预览版中修改。',
        {
          status: 409,
          code: 'CRM_ADMIN_PERMISSIONS_LOCKED',
        },
      );
    }
    const normalized = normalizePermissionRows(permissions);
    const knex = await this.knex();
    const role = await knex<IdentifierRow>('authzPermissionSets')
      .select('id')
      .where('key', '=', roleKey)
      .first();
    if (!role) throw roleNotFound(roleKey);

    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      const now = new Date().toISOString();
      let changed = false;
      for (const permission of normalized) {
        const actions = toStoredActions(permission);
        const existing = await transaction<StoredPermissionRow>(
          'authzObjectPermissions',
        )
          .select(['id', 'actions'])
          .where('permissionSetId', '=', role.id)
          .where('resource', '=', permission.resource)
          .first();
        if (existing) {
          if (storedActionsEqual(existing.actions, actions)) continue;
          await transaction('authzObjectPermissions')
            .where({ id: existing.id })
            .update({ actions: JSON.stringify(actions), updatedAt: now });
        } else {
          await transaction('authzObjectPermissions').insert({
            id: crypto.randomUUID(),
            permissionSetId: role.id,
            resource: permission.resource,
            actions: JSON.stringify(actions),
            createdAt: now,
            updatedAt: now,
          });
        }
        changed = true;
      }
      if (changed) {
        await this.writeAudit(transaction, {
          event: 'crm.role.permissions.updated',
          actorId,
          resourceId: roleKey,
          details: { permissions: normalized },
        });
      }
    });
    return this.getRolePermissions(roleKey);
  }

  async usesOwnScope(
    userId: string,
    resource: CrmResourceName,
  ): Promise<boolean> {
    await this.assertActiveMember(userId);
    const role = await this.getUserRole(userId);
    if (!role) throw memberNotFound(userId);
    const permission = (await this.getRolePermissions(role)).permissions.find(
      (item) => item.resource === resource,
    );
    return Boolean(permission?.supportsOwnScope && permission.scope === 'own');
  }

  async plan(
    userId: string,
    resource: CrmApiResourceName,
    action: string,
    record?: Readonly<Record<string, unknown>>,
  ): Promise<AuthorizationPlan> {
    await this.assertActiveMember(userId);
    return this.authorization.plan(
      { id: userId },
      { resource, action, ...(record ? { record } : {}) },
    );
  }

  async permissionsFor(userId: string): Promise<CrmAclResponse> {
    await this.assertActiveMember(userId);
    const role = await this.getUserRole(userId);
    if (!role) throw memberNotFound(userId);
    const actions: Record<string, Record<string, never>> = {};
    const resources: string[] = [];
    for (const resource of [...CRM_RESOURCES, 'user'] as const) {
      const plans = await this.authorization.planActions(
        { id: userId },
        {
          resource,
          actions: resource === 'user' ? ['list', 'get'] : actionNames,
        },
      );
      for (const [action, plan] of Object.entries(plans)) {
        if (plan.allowed) actions[`${resource}:${action}`] = {};
      }
      if (Object.keys(plans).some((action) => plans[action]?.allowed)) {
        resources.push(resource);
      }
    }
    return {
      role,
      roles: [role],
      resources,
      actions,
      snippets: [],
      allowConfigure: role === 'crm-admin',
    };
  }

  private async insertMember(
    knex: Knex,
    userId: string,
    roleKey: CrmRoleKey,
  ): Promise<void> {
    const now = new Date().toISOString();
    await knex('crmAppMembers').insert({
      id: crypto.randomUUID(),
      userId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await this.insertAssignment(knex, userId, roleKey, now);
  }

  private async insertAssignment(
    knex: Knex,
    userId: string,
    roleKey: CrmRoleKey,
    now: string,
  ): Promise<void> {
    const role = await knex<IdentifierRow>('authzPermissionSets')
      .select('id')
      .where('key', '=', roleKey)
      .first();
    if (!role) throw roleNotFound(roleKey);
    await knex('authzAssignments').insert({
      id: `crm-user-role-${userId}`,
      subjectType: 'user',
      subjectId: userId,
      targetType: 'permissionSet',
      targetId: role.id,
      startsAt: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async getUserRole(userId: string): Promise<CrmRoleKey | undefined> {
    const knex = await this.knex();
    const row = (await knex('authzAssignments as assignment')
      .innerJoin(
        'authzPermissionSets as role',
        'role.id',
        'assignment.targetId',
      )
      .where('assignment.subjectType', 'user')
      .where('assignment.subjectId', userId)
      .where('assignment.targetType', 'permissionSet')
      .whereIn('role.key', CRM_ROLE_KEYS)
      .select('role.key')
      .first()) as RoleKeyRow | undefined;
    return row ? parseRoleKey(row.key) : undefined;
  }

  private async userHasRole(
    userId: string,
    roleKey: CrmRoleKey,
  ): Promise<boolean> {
    return (await this.getUserRole(userId)) === roleKey;
  }

  private async activeAdminCount(): Promise<number> {
    const knex = await this.knex();
    const row = await knex('crmAppMembers as member')
      .innerJoin(
        'authzAssignments as assignment',
        'assignment.subjectId',
        'member.userId',
      )
      .innerJoin(
        'authzPermissionSets as role',
        'role.id',
        'assignment.targetId',
      )
      .where('member.status', 'active')
      .where('role.key', 'crm-admin')
      .count({ count: '*' })
      .first();
    return Number(row?.count ?? 0);
  }

  private async writeAudit(
    knex: Knex,
    input: {
      event: string;
      actorId: string;
      resourceId: string;
      details: Record<string, unknown>;
    },
  ): Promise<void> {
    await knex('authzAuditLogs').insert({
      id: crypto.randomUUID(),
      event: input.event,
      actorType: 'user',
      actorId: input.actorId,
      resourceType: 'crm-access-control',
      resourceId: input.resourceId,
      details: JSON.stringify(input.details),
      createdAt: new Date().toISOString(),
    });
  }

  private knex(): Promise<Knex> {
    return this.database.connection().client<Knex>();
  }
}

type StoredAction = {
  action: string;
  recordScope?: Array<{ policy: string }>;
};

function parseStoredActions(value: unknown): StoredAction[] {
  const parsed =
    typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is StoredAction =>
        Boolean(item && typeof item === 'object' && 'action' in item),
      )
    : [];
}

function storedActionsEqual(
  current: unknown,
  desired: readonly StoredAction[],
): boolean {
  return (
    JSON.stringify(parseStoredActions(current)) === JSON.stringify(desired)
  );
}

function toPermissionRow(
  resource: CrmResourceName,
  actions: readonly StoredAction[],
): CrmPermissionRow {
  const actionSet = new Set(actions.map((item) => item.action));
  const scope = actions.some((item) =>
    item.recordScope?.some(
      (recordScope) => recordScope.policy === 'recordsIOwn',
    ),
  )
    ? 'own'
    : 'all';
  return {
    resource,
    resourceTitle: resourceTitles[resource],
    capabilities: [
      ...(actionSet.has('list') ? (['read'] as const) : []),
      ...(actionSet.has('create') ? (['create'] as const) : []),
      ...(actionSet.has('update') ? (['update'] as const) : []),
      ...(actionSet.has('destroy') ? (['destroy'] as const) : []),
    ],
    scope,
    supportsOwnScope: ownerScopedResources.has(resource),
  };
}

function toStoredActions(permission: CrmPermissionRow): StoredAction[] {
  const actionSet = new Set(permission.capabilities);
  const actions = [
    ...(actionSet.has('read') ? ['list', 'get', 'query'] : []),
    ...(actionSet.has('create') ? ['create'] : []),
    ...(actionSet.has('update') ? ['update'] : []),
    ...(actionSet.has('destroy') ? ['destroy'] : []),
  ];
  return actions.map((action) => ({
    action,
    inputFields: '*',
    outputFields: '*',
    recordScope: [
      {
        policy: permission.scope === 'own' ? 'recordsIOwn' : 'allRecords',
      },
    ],
  }));
}

function normalizePermissionRows(
  permissions: readonly CrmPermissionRow[],
): CrmPermissionRow[] {
  const byResource = new Map<CrmResourceName, CrmPermissionRow>();
  for (const permission of permissions) {
    if (!CRM_RESOURCES.includes(permission.resource)) {
      throw invalidPermissionConfig('权限配置包含未知资源。');
    }
    if (byResource.has(permission.resource)) {
      throw invalidPermissionConfig(`重复配置了 ${permission.resource}。`);
    }
    if (!Array.isArray(permission.capabilities)) {
      throw invalidPermissionConfig(`${permission.resource} 的操作权限无效。`);
    }
    if (!['all', 'own'].includes(permission.scope)) {
      throw invalidPermissionConfig(`${permission.resource} 的数据范围无效。`);
    }
    byResource.set(permission.resource, permission);
  }
  return CRM_RESOURCES.map((resource) => {
    const permission = byResource.get(resource);
    if (!permission) {
      throw invalidPermissionConfig(`缺少 ${resource} 的权限配置。`);
    }
    if (
      permission.capabilities.some(
        (capability) =>
          !['read', 'create', 'update', 'destroy'].includes(capability),
      )
    ) {
      throw invalidPermissionConfig(`${resource} 包含未知操作权限。`);
    }
    const capabilities = [
      ...new Set(
        permission.capabilities.filter((capability) =>
          ['read', 'create', 'update', 'destroy'].includes(capability),
        ),
      ),
    ];
    const supportsOwnScope = ownerScopedResources.has(resource);
    return {
      resource,
      resourceTitle: resourceTitles[resource],
      capabilities,
      scope: supportsOwnScope && permission.scope === 'own' ? 'own' : 'all',
      supportsOwnScope,
    };
  });
}

function invalidPermissionConfig(message: string): CrmServiceError {
  return new CrmServiceError(message, {
    status: 400,
    code: 'CRM_PERMISSION_CONFIG_INVALID',
  });
}

export function filterAstToCrmFilter(ast: FilterAst | undefined): unknown {
  if (!ast || ast.root.items.length === 0) return undefined;
  return filterNodeToValue(ast.root);
}

function filterNodeToValue(
  node: FilterAst['root'] | FilterAst['root']['items'][number],
): unknown {
  if (node.kind === 'condition') {
    if (node.path.length !== 1) {
      throw new CrmServiceError('权限记录范围包含 CRM 不支持的字段路径。', {
        status: 500,
        code: 'CRM_PERMISSION_FILTER_UNSUPPORTED',
      });
    }
    return { [node.path[0]]: { [node.operator]: node.value } };
  }
  if (node.kind === 'group') {
    if (node.items.length === 0) return undefined;
    const values = node.items.map(filterNodeToValue).filter(Boolean);
    if (values.length === 1) return values[0];
    return { [node.logic === 'and' ? '$and' : '$or']: values };
  }
  throw new CrmServiceError('权限记录范围包含 CRM 暂不支持的规则。', {
    status: 500,
    code: 'CRM_PERMISSION_FILTER_UNSUPPORTED',
  });
}

export function combineCrmFilters(left: unknown, right: unknown): unknown {
  if (!left) return right;
  if (!right) return left;
  return { $and: [left, right] };
}

export function parseRoleKey(value: unknown): CrmRoleKey {
  if (
    typeof value === 'string' &&
    CRM_ROLE_KEYS.includes(value as CrmRoleKey)
  ) {
    return value as CrmRoleKey;
  }
  throw new CrmServiceError('无效的 CRM 角色。', {
    status: 400,
    code: 'CRM_ROLE_INVALID',
  });
}

function parseMemberStatus(value: unknown): CrmMemberStatus {
  if (value === 'active' || value === 'disabled') return value;
  throw new CrmServiceError('无效的成员状态。', {
    status: 400,
    code: 'CRM_MEMBER_STATUS_INVALID',
  });
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function roleNotFound(roleKey: string): CrmServiceError {
  return new CrmServiceError(`CRM 角色 ${roleKey} 不存在。`, {
    status: 404,
    code: 'CRM_ROLE_NOT_FOUND',
  });
}

function memberNotFound(userId: string): CrmServiceError {
  return new CrmServiceError(`CRM 成员 ${userId} 不存在。`, {
    status: 404,
    code: 'CRM_MEMBER_NOT_FOUND',
  });
}
