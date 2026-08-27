import type { AppAuthorization } from '@nocobase/app-plugin-authorization';
import type { DatabaseManager } from '@nocobase/app-database';
import type {
  DatabaseActionGrant,
  DatabaseAuthorizationConditions,
  DatabaseFieldFilter,
  DatabaseFilter,
  DatabaseFilterOperator,
  DatabaseFilterValue,
  DatabaseGrantDefinition,
  DatabaseRecordAccess,
} from '@nocobase/authorization/database';
import type { PermissionGrant } from '@nocobase/authorization/permissions';
import type { Knex } from 'knex';

import type {
  AppAccessAuthorizationPlan,
  AppAccessControlDefinition,
  AppAccessControlResponse,
  AppAccessMemberStatus,
  AppAccessMemberSummary,
  AppAccessMemberUpdate,
  AppAccessPermissionCapability,
  AppAccessPermissionRow,
  AppAccessRolePermissionSettings,
  AppAccessRoleSummary,
} from '../types.js';
import { normalizeAccessControlDefinition } from './options.js';

const actionNames = [
  'list',
  'get',
  'create',
  'update',
  'destroy',
  'query',
] as const;

export class AppAccessControlError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    options: { readonly status: number; readonly code: string },
  ) {
    super(message);
    this.name = 'AppAccessControlError';
    this.status = options.status;
    this.code = options.code;
  }
}

export interface AppAccessControlService {
  assertActiveMember(userId: string): Promise<void>;
  assertCanConfigure(userId: string): Promise<void>;
  ensureMember(userId: string): Promise<void>;
  hasUserIdentity(email: string, username: string): Promise<boolean>;
  listMembers(): Promise<AppAccessMemberSummary[]>;
  listRoles(): Promise<AppAccessRoleSummary[]>;
  addMember(userId: string, roleKey: string, actorId: string): Promise<void>;
  removeProvisionedUser(userId: string): Promise<void>;
  updateMember(
    userId: string,
    input: AppAccessMemberUpdate,
    actorId: string,
  ): Promise<void>;
  getRolePermissions(roleKey: string): Promise<AppAccessRolePermissionSettings>;
  updateRolePermissions(
    roleKey: string,
    permissions: readonly AppAccessPermissionRow[],
    actorId: string,
  ): Promise<AppAccessRolePermissionSettings>;
  usesOwnScope(userId: string, resource: string): Promise<boolean>;
  plan(
    userId: string,
    resource: string,
    action: string,
    record?: Readonly<Record<string, unknown>>,
  ): Promise<AppAccessAuthorizationPlan>;
  permissionsFor(userId: string): Promise<AppAccessControlResponse>;
}

interface MemberRow {
  readonly status: unknown;
  readonly userId: string;
}

interface MemberListRow {
  readonly id: string;
  readonly name: string;
  readonly username: string | null;
  readonly email: string;
  readonly createdAt: string | Date;
  readonly status: unknown;
  readonly roleKey: unknown;
  readonly roleTitle: string | null;
}

interface RoleListRow {
  readonly key: unknown;
  readonly title: string | null;
  readonly memberCount: number | string | null;
}

interface RoleKeyRow {
  readonly permissionSetKey: unknown;
}

interface PermissionSetKeyRow {
  readonly key: unknown;
}

export function createAppAccessControlService(
  database: DatabaseManager,
  definition: AppAccessControlDefinition,
  authorization: AppAuthorization,
): AppAccessControlService {
  return new DatabaseAppAccessControlService(
    database,
    normalizeAccessControlDefinition(definition),
    authorization,
  );
}

class DatabaseAppAccessControlService implements AppAccessControlService {
  private readonly memberTableName: string;
  private readonly roleKeys: readonly string[];

  constructor(
    private readonly database: DatabaseManager,
    private readonly definition: AppAccessControlDefinition,
    private readonly authorization: AppAuthorization,
  ) {
    this.memberTableName = definition.memberTableName ?? 'appMembers';
    this.roleKeys = definition.roles.map((role) => role.key);
    this.registerAuthorizationResources();
  }

  async ensureMember(userId: string): Promise<void> {
    const knex = await this.knex();
    const existing = await knex<MemberRow>(this.memberTableName)
      .where({ userId })
      .first();
    if (existing) return;
    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      const current = await transaction<MemberRow>(this.memberTableName)
        .where({ userId })
        .first();
      if (current) return;
      const memberCount = Number(
        (
          await transaction(this.memberTableName)
            .count<{ count: number | string }>({ count: '*' })
            .first()
        )?.count ?? 0,
      );
      if (memberCount > 0) {
        throw this.error(
          '当前账号还不是该 App 的成员。',
          403,
          'MEMBERSHIP_REQUIRED',
        );
      }
      await this.insertMember(
        transaction,
        userId,
        this.definition.adminRoleKey,
      );
    });
  }

  async assertActiveMember(userId: string): Promise<void> {
    await this.ensureMember(userId);
    const knex = await this.knex();
    const member = await knex<MemberRow>(this.memberTableName)
      .select('status')
      .where({ userId })
      .first();
    if (member?.status !== 'active') {
      throw this.error('当前成员已停用。', 403, 'MEMBER_DISABLED');
    }
  }

  async assertCanConfigure(userId: string): Promise<void> {
    await this.assertActiveMember(userId);
    if ((await this.getUserRole(userId)) !== this.definition.adminRoleKey) {
      throw this.error(
        '只有 App 管理员可以修改成员和权限。',
        403,
        'SETTINGS_FORBIDDEN',
      );
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

  async listMembers(): Promise<AppAccessMemberSummary[]> {
    const knex = await this.knex();
    const rows = (await knex(`${this.memberTableName} as member`)
      .innerJoin('user', 'user.id', 'member.userId')
      .innerJoin(
        'authorizationPermissionSetAssignments as assignment',
        'assignment.subjectId',
        'member.userId',
      )
      .innerJoin(
        'authorizationPermissionSets as role',
        'role.key',
        'assignment.permissionSetKey',
      )
      .where('assignment.subjectType', 'user')
      .whereIn('role.key', this.roleKeys)
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
      status: this.parseMemberStatus(row.status),
      roleKey: this.parseRoleKey(row.roleKey),
      roleTitle: String(row.roleTitle ?? row.roleKey),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    }));
  }

  async listRoles(): Promise<AppAccessRoleSummary[]> {
    const knex = await this.knex();
    const rows: RoleListRow[] = await knex(
      'authorizationPermissionSets as role',
    )
      .leftJoin(
        'authorizationPermissionSetAssignments as assignment',
        'assignment.permissionSetKey',
        'role.key',
      )
      .whereIn('role.key', this.roleKeys)
      .groupBy(['role.id', 'role.key', 'role.title'])
      .select([
        'role.key',
        'role.title',
        knex.raw(
          'sum(case when assignment.subjectType = ? then 1 else 0 end) as memberCount',
          ['user'],
        ),
      ]);
    const order = new Map(this.roleKeys.map((key, index) => [key, index]));
    return rows
      .map((row) => {
        const key = this.parseRoleKey(row.key);
        const definition = this.definition.roles.find(
          (role) => role.key === key,
        );
        return {
          key,
          title: String(row.title ?? definition?.title ?? key),
          description: definition?.description ?? '',
          memberCount: Number(row.memberCount ?? 0),
          system: Boolean(definition?.system),
        };
      })
      .sort(
        (left, right) =>
          (order.get(left.key) ?? 99) - (order.get(right.key) ?? 99),
      );
  }

  async addMember(
    userId: string,
    roleKey: string,
    actorId: string,
  ): Promise<void> {
    const normalizedRoleKey = this.parseRoleKey(roleKey);
    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      await this.insertMember(transaction, userId, normalizedRoleKey);
      await this.writeAudit(transaction, 'member.created', actorId, userId, {
        roleKey: normalizedRoleKey,
      });
    });
  }

  async removeProvisionedUser(userId: string): Promise<void> {
    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      await transaction('authorizationPermissionSetAssignments')
        .where({ subjectType: 'user', subjectId: userId })
        .delete();
      await transaction(this.memberTableName).where({ userId }).delete();
      await transaction('session').where({ userId }).delete();
      await transaction('account').where({ userId }).delete();
      await transaction('user').where({ id: userId }).delete();
    });
  }

  async updateMember(
    userId: string,
    input: AppAccessMemberUpdate,
    actorId: string,
  ): Promise<void> {
    const roleKey = this.parseRoleKey(input.roleKey);
    const status = this.parseMemberStatus(input.status);
    const currentRole = await this.getUserRole(userId);
    if (!currentRole) throw this.memberNotFound(userId);
    const knex = await this.knex();
    const currentMember = await knex<MemberRow>(this.memberTableName)
      .select('status')
      .where({ userId })
      .first();
    if (!currentMember) throw this.memberNotFound(userId);
    const currentStatus = this.parseMemberStatus(currentMember.status);
    if (currentRole === roleKey && currentStatus === status) return;
    if (userId === actorId && status === 'disabled') {
      throw this.error('不能停用当前登录账号。', 409, 'MEMBER_SELF_DISABLE');
    }
    if (
      currentRole === this.definition.adminRoleKey &&
      (roleKey !== this.definition.adminRoleKey || status === 'disabled') &&
      (await this.activeAdminCount()) <= 1
    ) {
      throw this.error(
        '必须至少保留一名启用状态的管理员。',
        409,
        'LAST_ADMIN_REQUIRED',
      );
    }
    await this.database.transaction(async (connection) => {
      const transaction = await connection.client<Knex>();
      const now = new Date();
      await transaction(this.memberTableName)
        .where({ userId })
        .update({ status, updatedAt: now });
      await transaction('authorizationPermissionSetAssignments')
        .where({ subjectType: 'user', subjectId: userId })
        .whereIn('permissionSetKey', this.roleKeys)
        .delete();
      await this.insertAssignment(transaction, userId, roleKey, now);
      await this.writeAudit(transaction, 'member.updated', actorId, userId, {
        status,
        roleKey,
      });
    });
  }

  async getRolePermissions(
    roleKey: string,
  ): Promise<AppAccessRolePermissionSettings> {
    const normalizedRoleKey = this.parseRoleKey(roleKey);
    const role = (await this.listRoles()).find(
      (item) => item.key === normalizedRoleKey,
    );
    if (!role) throw this.roleNotFound(normalizedRoleKey);
    const permissionSet =
      await this.authorization.permissionSets.get(normalizedRoleKey);
    if (!permissionSet) throw this.roleNotFound(normalizedRoleKey);
    return {
      role,
      permissions: this.definition.resources.map((resource) =>
        this.toPermissionRow(resource.name, permissionSet.grants),
      ),
    };
  }

  async updateRolePermissions(
    roleKey: string,
    permissions: readonly AppAccessPermissionRow[],
    actorId: string,
  ): Promise<AppAccessRolePermissionSettings> {
    const normalizedRoleKey = this.parseRoleKey(roleKey);
    if (
      this.definition.roles.find((role) => role.key === normalizedRoleKey)
        ?.system
    ) {
      throw this.error(
        '系统角色的权限受到保护，不能修改。',
        409,
        'SYSTEM_ROLE_LOCKED',
      );
    }
    const normalized = this.normalizePermissionRows(permissions);
    const permissionSet =
      await this.authorization.permissionSets.get(normalizedRoleKey);
    if (!permissionSet) throw this.roleNotFound(normalizedRoleKey);
    const businessResources = new Set(
      this.definition.resources.map((resource) => `main.${resource.name}`),
    );
    const preserved = permissionSet.grants.filter(
      (grant) =>
        grant.resource.type !== 'database.collection' ||
        !businessResources.has(grant.resource.id),
    );
    const grants = [
      ...preserved,
      ...normalized.map((permission) => this.toPermissionGrant(permission)),
    ];
    if (JSON.stringify(permissionSet.grants) === JSON.stringify(grants)) {
      return this.getRolePermissions(normalizedRoleKey);
    }
    await this.authorization.permissionSets.update(normalizedRoleKey, {
      key: normalizedRoleKey,
      title: permissionSet.title,
      grants,
    });
    const knex = await this.knex();
    await this.writeAudit(
      knex,
      'role.permissions.updated',
      actorId,
      normalizedRoleKey,
      { permissions: normalized },
    );
    return this.getRolePermissions(normalizedRoleKey);
  }

  async usesOwnScope(userId: string, resource: string): Promise<boolean> {
    await this.assertActiveMember(userId);
    const role = await this.getUserRole(userId);
    if (!role) throw this.memberNotFound(userId);
    const permission = (await this.getRolePermissions(role)).permissions.find(
      (item) => item.resource === resource,
    );
    return Boolean(permission?.supportsOwnScope && permission.scope === 'own');
  }

  async plan(
    userId: string,
    resource: string,
    action: string,
    record?: Readonly<Record<string, unknown>>,
  ): Promise<AppAccessAuthorizationPlan> {
    await this.assertActiveMember(userId);
    const decision = await this.authorization
      .for({ principal: { type: 'user', id: userId } })
      .authorize({
        resource: { type: 'database.collection', id: resource },
        action,
      });
    if (
      decision.effect !== 'conditional' ||
      !isDatabaseAuthorizationConditions(decision.conditions)
    ) {
      return { allowed: decision.effect === 'permit' };
    }
    const filter = decision.conditions.filter;
    return {
      allowed: record ? matchesDatabaseFilter(record, filter) : true,
      filter,
    };
  }

  async permissionsFor(userId: string): Promise<AppAccessControlResponse> {
    await this.assertActiveMember(userId);
    const role = await this.getUserRole(userId);
    if (!role) throw this.memberNotFound(userId);
    const actions: Record<string, Record<string, never>> = {};
    const resources: string[] = [];
    for (const resource of [
      ...this.definition.resources.map((item) => item.name),
      'user',
    ]) {
      let resourceAllowed = false;
      for (const action of resource === 'user'
        ? ['list', 'get']
        : actionNames) {
        const plan = await this.plan(userId, resource, action);
        if (!plan.allowed) continue;
        actions[`${resource}:${action}`] = {};
        resourceAllowed = true;
      }
      if (resourceAllowed) resources.push(resource);
    }
    return {
      role,
      roles: [role],
      resources,
      actions,
      snippets: [],
      allowConfigure: role === this.definition.adminRoleKey,
    };
  }

  private registerAuthorizationResources(): void {
    for (const resource of [
      ...this.definition.resources,
      { name: 'user', title: 'Users', supportsOwnScope: false },
    ]) {
      if (this.authorization.database.collections.get(resource.name)) continue;
      const supportsOwnScope = Boolean(resource.supportsOwnScope);
      this.authorization.database.collections.add({
        name: resource.name,
        title: resource.title,
        actions: resource.name === 'user' ? ['list', 'get'] : actionNames,
        fields: supportsOwnScope ? ['id', 'ownerId'] : ['id'],
        attributes: supportsOwnScope
          ? { identifier: 'id', owner: 'ownerId' }
          : { identifier: 'id' },
      });
    }
  }

  private async insertMember(
    knex: Knex,
    userId: string,
    roleKey: string,
  ): Promise<void> {
    const now = new Date();
    await knex(this.memberTableName).insert({
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
    roleKey: string,
    now: Date,
  ): Promise<void> {
    const role = await knex<PermissionSetKeyRow>('authorizationPermissionSets')
      .select('key')
      .where('key', roleKey)
      .first();
    if (!role) throw this.roleNotFound(roleKey);
    await knex('authorizationPermissionSetAssignments').insert({
      id: `${this.definition.appKey}-user-role-${userId}`,
      subjectType: 'user',
      subjectId: userId,
      permissionSetKey: roleKey,
      createdAt: now,
      updatedAt: now,
    });
  }

  private async getUserRole(userId: string): Promise<string | undefined> {
    const knex = await this.knex();
    const row = await knex<RoleKeyRow>('authorizationPermissionSetAssignments')
      .where('subjectType', 'user')
      .where('subjectId', userId)
      .whereIn('permissionSetKey', this.roleKeys)
      .select('permissionSetKey')
      .first();
    return row ? this.parseRoleKey(row.permissionSetKey) : undefined;
  }

  private async activeAdminCount(): Promise<number> {
    const knex = await this.knex();
    const row = await knex(`${this.memberTableName} as member`)
      .innerJoin(
        'authorizationPermissionSetAssignments as assignment',
        'assignment.subjectId',
        'member.userId',
      )
      .where('member.status', 'active')
      .where('assignment.subjectType', 'user')
      .where('assignment.permissionSetKey', this.definition.adminRoleKey)
      .count({ count: '*' })
      .first();
    return Number(row?.count ?? 0);
  }

  private async writeAudit(
    knex: Knex,
    event: string,
    actorId: string,
    resourceId: string,
    details: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await knex('appAccessControlAuditLogs').insert({
      id: crypto.randomUUID(),
      appKey: this.definition.appKey,
      event: `${this.definition.appKey}.${event}`,
      actorId,
      resourceId,
      details: JSON.stringify(details),
      createdAt: new Date(),
    });
  }

  private toPermissionRow(
    resourceName: string,
    grants: readonly PermissionGrant[],
  ): AppAccessPermissionRow {
    const resource = this.definition.resources.find(
      (item) => item.name === resourceName,
    );
    if (!resource)
      throw this.error('权限配置包含未知资源。', 500, 'RESOURCE_UNKNOWN');
    const grant = grants.find(
      (item) =>
        item.resource.type === 'database.collection' &&
        item.resource.id === `main.${resourceName}`,
    );
    const actionNames = new Set(grant?.actions.map((action) => action.action));
    const scope = grant?.actions.some((action) =>
      databaseRecordAccess(action.policy).some(isOwnRecordAccess),
    )
      ? 'own'
      : 'all';
    return {
      resource: resource.name,
      resourceTitle: resource.title,
      capabilities: [
        ...(actionNames.has('list') ? (['read'] as const) : []),
        ...(actionNames.has('create') ? (['create'] as const) : []),
        ...(actionNames.has('update') ? (['update'] as const) : []),
        ...(actionNames.has('destroy') ? (['destroy'] as const) : []),
      ],
      scope,
      supportsOwnScope: Boolean(resource.supportsOwnScope),
    };
  }

  private toPermissionGrant(
    permission: AppAccessPermissionRow,
  ): PermissionGrant {
    const capabilities = new Set(permission.capabilities);
    const recordAccess = [
      permission.supportsOwnScope && permission.scope === 'own'
        ? 'recordsIOwn'
        : 'allRecords',
    ];
    const definition: DatabaseGrantDefinition = {
      ...(capabilities.has('read')
        ? {
            list: databaseAction(recordAccess),
            get: databaseAction(recordAccess),
            query: databaseAction(recordAccess),
          }
        : {}),
      ...(capabilities.has('create') ? { create: databaseAction() } : {}),
      ...(capabilities.has('update')
        ? { update: databaseAction(recordAccess) }
        : {}),
      ...(capabilities.has('destroy')
        ? { destroy: databaseAction(recordAccess) }
        : {}),
    };
    return this.authorization.database.grant(permission.resource, definition);
  }

  private normalizePermissionRows(
    permissions: readonly AppAccessPermissionRow[],
  ): AppAccessPermissionRow[] {
    const byResource = new Map<string, AppAccessPermissionRow>();
    for (const permission of permissions) {
      if (
        !this.definition.resources.some(
          (resource) => resource.name === permission.resource,
        ) ||
        byResource.has(permission.resource)
      ) {
        throw this.error(
          '权限配置包含未知或重复资源。',
          400,
          'PERMISSION_CONFIG_INVALID',
        );
      }
      byResource.set(permission.resource, permission);
    }
    return this.definition.resources.map((resource) => {
      const permission = byResource.get(resource.name);
      if (!permission) {
        throw this.error(
          `缺少 ${resource.title} 的权限配置。`,
          400,
          'PERMISSION_CONFIG_INVALID',
        );
      }
      const capabilities = [...new Set(permission.capabilities)].filter(
        (capability): capability is AppAccessPermissionCapability =>
          ['read', 'create', 'update', 'destroy'].includes(capability),
      );
      return {
        resource: resource.name,
        resourceTitle: resource.title,
        capabilities,
        scope:
          resource.supportsOwnScope && permission.scope === 'own'
            ? 'own'
            : 'all',
        supportsOwnScope: Boolean(resource.supportsOwnScope),
      };
    });
  }

  private parseRoleKey(value: unknown): string {
    if (typeof value === 'string' && this.roleKeys.includes(value))
      return value;
    throw this.error('无效的 App 角色。', 400, 'ROLE_INVALID');
  }

  private parseMemberStatus(value: unknown): AppAccessMemberStatus {
    if (value === 'active' || value === 'disabled') return value;
    throw this.error('无效的成员状态。', 400, 'MEMBER_STATUS_INVALID');
  }

  private roleNotFound(roleKey: string): AppAccessControlError {
    return this.error(`角色 ${roleKey} 不存在。`, 404, 'ROLE_NOT_FOUND');
  }

  private memberNotFound(userId: string): AppAccessControlError {
    return this.error(`成员 ${userId} 不存在。`, 404, 'MEMBER_NOT_FOUND');
  }

  private error(
    message: string,
    status: number,
    suffix: string,
  ): AppAccessControlError {
    return new AppAccessControlError(message, {
      status,
      code: `${this.definition.appKey.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_${suffix}`,
    });
  }

  private knex(): Promise<Knex> {
    return this.database.connection().client<Knex>();
  }
}

function databaseAction(
  recordAccess?: readonly DatabaseRecordAccess[],
): DatabaseActionGrant {
  return {
    fields: { input: '*', output: '*' },
    ...(recordAccess === undefined ? {} : { recordAccess }),
  };
}

function databaseRecordAccess(
  policy: unknown,
): readonly DatabaseRecordAccess[] {
  if (!isRecord(policy)) return [];
  const recordAccess = policy.recordAccess;
  return Array.isArray(recordAccess)
    ? recordAccess.filter(isDatabaseRecordAccess)
    : [];
}

function isDatabaseRecordAccess(value: unknown): value is DatabaseRecordAccess {
  return (
    (typeof value === 'string' && value.length > 0) ||
    (value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof Reflect.get(value, 'key') === 'string')
  );
}

function isOwnRecordAccess(value: DatabaseRecordAccess): boolean {
  return typeof value === 'string'
    ? value === 'recordsIOwn'
    : value.key === 'recordsIOwn';
}

function matchesDatabaseFilter(
  record: Readonly<Record<string, unknown>>,
  filter: DatabaseFilter,
): boolean {
  return Object.entries(filter).every(([field, expression]) => {
    if (field === '$and' || field === '$or') {
      if (!isDatabaseFilterList(expression)) return false;
      return field === '$and'
        ? expression.every((item) => matchesDatabaseFilter(record, item))
        : expression.some((item) => matchesDatabaseFilter(record, item));
    }
    if (!isDatabaseFieldFilter(expression)) return false;
    return Object.entries(expression).every(([operator, expected]) =>
      matchesOperator(
        record[field],
        operator as DatabaseFilterOperator,
        expected,
      ),
    );
  });
}

function matchesOperator(
  actual: unknown,
  operator: DatabaseFilterOperator,
  expected: unknown,
): boolean {
  switch (operator) {
    case '$eq':
      return actual === expected;
    case '$ne':
      return actual !== expected;
    case '$in':
      return Array.isArray(expected) && expected.includes(actual);
    case '$notIn':
      return Array.isArray(expected) && !expected.includes(actual);
    case '$gt':
      return comparable(actual) > comparable(expected);
    case '$gte':
      return comparable(actual) >= comparable(expected);
    case '$lt':
      return comparable(actual) < comparable(expected);
    case '$lte':
      return comparable(actual) <= comparable(expected);
    default:
      return false;
  }
}

function comparable(value: unknown): string | number {
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

function isDatabaseAuthorizationConditions(
  value: unknown,
): value is DatabaseAuthorizationConditions {
  return (
    isRecord(value) &&
    value.type === 'database' &&
    typeof value.collection === 'string' &&
    typeof value.action === 'string' &&
    isDatabaseFilter(value.filter)
  );
}

function isDatabaseFilter(value: unknown): value is DatabaseFilter {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([field, expression]) =>
    field === '$and' || field === '$or'
      ? isDatabaseFilterList(expression)
      : isDatabaseFieldFilter(expression),
  );
}

function isDatabaseFilterList(
  value: unknown,
): value is readonly DatabaseFilter[] {
  return Array.isArray(value) && value.every(isDatabaseFilter);
}

function isDatabaseFieldFilter(value: unknown): value is DatabaseFieldFilter {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([operator, operand]) =>
      isDatabaseFilterOperator(operator) && isDatabaseFilterValue(operand),
  );
}

function isDatabaseFilterOperator(
  value: string,
): value is DatabaseFilterOperator {
  return ['$eq', '$ne', '$in', '$notIn', '$gt', '$gte', '$lt', '$lte'].includes(
    value,
  );
}

function isDatabaseFilterValue(value: unknown): value is DatabaseFilterValue {
  return Array.isArray(value)
    ? value.every(isDatabaseFilterScalar)
    : isDatabaseFilterScalar(value);
}

function isDatabaseFilterScalar(
  value: unknown,
): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
