import {
  Authorization,
  DatabaseAuthorizationStore,
  type AuthorizationPlan,
} from '@nocobase/authorization';
import type { DatabaseManager } from '@nocobase/app-database';
import type { Knex } from 'knex';

import type {
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
  ): Promise<AuthorizationPlan>;
  permissionsFor(userId: string): Promise<AppAccessControlResponse>;
}

interface IdentifierRow {
  readonly id: string;
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
  readonly roleTitle: string;
}

interface RoleListRow {
  readonly key: unknown;
  readonly title: string;
  readonly description: string | null;
  readonly memberCount: number | string | null;
}

interface StoredPermissionRow {
  readonly id: string;
  readonly resource: unknown;
  readonly actions: unknown;
}

interface RoleKeyRow {
  readonly key: unknown;
}

interface StoredAction {
  readonly action: string;
  readonly recordScope?: ReadonlyArray<{ readonly policy: string }>;
}

export function createAppAccessControlService(
  database: DatabaseManager,
  definition: AppAccessControlDefinition,
): AppAccessControlService {
  return new DatabaseAppAccessControlService(
    database,
    normalizeAccessControlDefinition(definition),
  );
}

class DatabaseAppAccessControlService implements AppAccessControlService {
  private readonly authorization: Authorization;
  private readonly memberTableName: string;
  private readonly roleKeys: readonly string[];

  constructor(
    private readonly database: DatabaseManager,
    private readonly definition: AppAccessControlDefinition,
  ) {
    this.memberTableName = definition.memberTableName ?? 'appMembers';
    this.roleKeys = definition.roles.map((role) => role.key);
    this.authorization = new Authorization({
      store: new DatabaseAuthorizationStore(database.connection()),
    });
    for (const resource of definition.resources) {
      this.authorization.resources.register({
        name: resource.name,
        actions: actionNames,
        fields: {
          id: { type: 'scalar' },
          ownerId: { type: 'scalar' },
        },
        attributes: resource.supportsOwnScope
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
      roleTitle: String(row.roleTitle),
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    }));
  }

  async listRoles(): Promise<AppAccessRoleSummary[]> {
    const knex = await this.knex();
    const rows: RoleListRow[] = await knex('authzPermissionSets as role')
      .leftJoin(
        'authzAssignments as assignment',
        'assignment.targetId',
        'role.id',
      )
      .whereIn('role.key', this.roleKeys)
      .groupBy(['role.id', 'role.key', 'role.title', 'role.description'])
      .select([
        'role.key',
        'role.title',
        'role.description',
        knex.raw(
          'sum(case when assignment.subjectType = ? and assignment.targetType = ? then 1 else 0 end) as memberCount',
          ['user', 'permissionSet'],
        ),
      ]);
    const order = new Map(this.roleKeys.map((key, index) => [key, index]));
    return rows
      .map((row) => {
        const key = this.parseRoleKey(row.key);
        return {
          key,
          title: String(row.title),
          description: String(row.description ?? ''),
          memberCount: Number(row.memberCount ?? 0),
          system: Boolean(
            this.definition.roles.find((role) => role.key === key)?.system,
          ),
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
      await transaction('authzAssignments')
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
      const now = new Date().toISOString();
      await transaction(this.memberTableName)
        .where({ userId })
        .update({ status, updatedAt: now });
      await transaction('authzAssignments')
        .where({ subjectType: 'user', subjectId: userId })
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
    const knex = await this.knex();
    const rows: StoredPermissionRow[] = await knex(
      'authzObjectPermissions as permission',
    )
      .innerJoin(
        'authzPermissionSets as role',
        'role.id',
        'permission.permissionSetId',
      )
      .where('role.key', normalizedRoleKey)
      .whereIn(
        'permission.resource',
        this.definition.resources.map((resource) => resource.name),
      )
      .select(['permission.id', 'permission.resource', 'permission.actions']);
    const byResource = new Map(
      rows.map((row) => [
        String(row.resource),
        parseStoredActions(row.actions),
      ]),
    );
    return {
      role,
      permissions: this.definition.resources.map((resource) =>
        this.toPermissionRow(
          resource.name,
          byResource.get(resource.name) ?? [],
        ),
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
    const knex = await this.knex();
    const role = await knex<IdentifierRow>('authzPermissionSets')
      .select('id')
      .where('key', normalizedRoleKey)
      .first();
    if (!role) throw this.roleNotFound(normalizedRoleKey);
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
          .where('permissionSetId', role.id)
          .where('resource', permission.resource)
          .first();
        if (existing && storedActionsEqual(existing.actions, actions)) continue;
        if (existing) {
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
        await this.writeAudit(
          transaction,
          'role.permissions.updated',
          actorId,
          normalizedRoleKey,
          { permissions: normalized },
        );
      }
    });
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
  ): Promise<AuthorizationPlan> {
    await this.assertActiveMember(userId);
    return this.authorization.plan(
      { id: userId },
      { resource, action, ...(record ? { record } : {}) },
    );
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
      if (Object.values(plans).some((plan) => plan.allowed))
        resources.push(resource);
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

  private async insertMember(
    knex: Knex,
    userId: string,
    roleKey: string,
  ): Promise<void> {
    const now = new Date().toISOString();
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
    now: string,
  ): Promise<void> {
    const role = await knex<IdentifierRow>('authzPermissionSets')
      .select('id')
      .where('key', roleKey)
      .first();
    if (!role) throw this.roleNotFound(roleKey);
    await knex('authzAssignments').insert({
      id: `${this.definition.appKey}-user-role-${userId}`,
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

  private async getUserRole(userId: string): Promise<string | undefined> {
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
      .whereIn('role.key', this.roleKeys)
      .select('role.key')
      .first()) as RoleKeyRow | undefined;
    return row ? this.parseRoleKey(row.key) : undefined;
  }

  private async activeAdminCount(): Promise<number> {
    const knex = await this.knex();
    const row = await knex(`${this.memberTableName} as member`)
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
      .where('role.key', this.definition.adminRoleKey)
      .count({ count: '*' })
      .first();
    return Number(row?.count ?? 0);
  }

  private async writeAudit(
    knex: Knex,
    event: string,
    actorId: string,
    resourceId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await knex('authzAuditLogs').insert({
      id: crypto.randomUUID(),
      event: `${this.definition.appKey}.${event}`,
      actorType: 'user',
      actorId,
      resourceType: `${this.definition.appKey}-access-control`,
      resourceId,
      details: JSON.stringify(details),
      createdAt: new Date().toISOString(),
    });
  }

  private toPermissionRow(
    resourceName: string,
    actions: readonly StoredAction[],
  ): AppAccessPermissionRow {
    const resource = this.definition.resources.find(
      (item) => item.name === resourceName,
    );
    if (!resource)
      throw this.error('权限配置包含未知资源。', 500, 'RESOURCE_UNKNOWN');
    const actionSet = new Set(actions.map((item) => item.action));
    const scope = actions.some((item) =>
      item.recordScope?.some(
        (recordScope) => recordScope.policy === 'recordsIOwn',
      ),
    )
      ? 'own'
      : 'all';
    return {
      resource: resource.name,
      resourceTitle: resource.title,
      capabilities: [
        ...(actionSet.has('list') ? (['read'] as const) : []),
        ...(actionSet.has('create') ? (['create'] as const) : []),
        ...(actionSet.has('update') ? (['update'] as const) : []),
        ...(actionSet.has('destroy') ? (['destroy'] as const) : []),
      ],
      scope,
      supportsOwnScope: Boolean(resource.supportsOwnScope),
    };
  }

  private normalizePermissionRows(
    permissions: readonly AppAccessPermissionRow[],
  ): AppAccessPermissionRow[] {
    const byResource = new Map<string, AppAccessPermissionRow>();
    for (const permission of permissions) {
      if (
        !this.definition.resources.some(
          (resource) => resource.name === permission.resource,
        )
      ) {
        throw this.error(
          '权限配置包含未知资源。',
          400,
          'PERMISSION_CONFIG_INVALID',
        );
      }
      if (byResource.has(permission.resource)) {
        throw this.error(
          `重复配置了 ${permission.resource}。`,
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

function toStoredActions(permission: AppAccessPermissionRow): StoredAction[] {
  const capabilities = new Set(permission.capabilities);
  const actions = [
    ...(capabilities.has('read') ? ['list', 'get', 'query'] : []),
    ...(capabilities.has('create') ? ['create'] : []),
    ...(capabilities.has('update') ? ['update'] : []),
    ...(capabilities.has('destroy') ? ['destroy'] : []),
  ];
  return actions.map((action) => ({
    action,
    recordScope: [
      { policy: permission.scope === 'own' ? 'recordsIOwn' : 'allRecords' },
    ],
  }));
}
