import permissionSetsMigration from '@nocobase/authorization/permissions/migrations/202608210001_create_permission_set_tables';
import defaultAccessMigration from '@nocobase/authorization/default-access/migrations/202608210002_create_default_access_rules';
import sharingRulesMigration from '@nocobase/authorization/sharing-rules/migrations/202608210003_create_sharing_rules';
import restrictionRulesMigration from '@nocobase/authorization/restriction-rules/migrations/202608210004_create_restriction_rules';
import {
  defineMigration,
  type CollectionDefinitionBuilder,
  type MigrationContext,
  type MigrationDefinition,
} from '@nocobase/app-database';
import type { Knex } from 'knex';

import type {
  AppAccessControlDefinition,
  AppAccessDefaultPermission,
} from '../types.js';
import { normalizeAccessControlDefinition } from './options.js';

/**
 * Creates the App membership table and seeds App roles into the shared
 * authorization Permission Set store. The storage tables themselves are the
 * canonical tables from @nocobase/authorization; this package only owns the
 * App-specific membership and role baseline.
 */
export function createAppAccessControlMigration(
  name: string,
  input: AppAccessControlDefinition,
): MigrationDefinition {
  const definition = normalizeAccessControlDefinition(input);
  const memberTableName = definition.memberTableName ?? 'appMembers';
  const constraintPrefix = definition.appKey.replace(/[^a-z0-9]+/gi, '_');

  return defineMigration({
    name,
    async up(context: MigrationContext): Promise<void> {
      await ensureAuthorizationStorage(context);
      await ensureAccessControlAuditStorage(context);

      await context.builder.createCollection(memberTableName, (collection) => {
        collection.string('id', { length: 64 }).notNull();
        collection.string('userId', { length: 64 }).notNull();
        collection
          .string('status', { length: 32 })
          .notNull()
          .defaultTo('active');
        timestamps(collection);
        collection.primary('id', { name: `pk_${constraintPrefix}_members` });
        collection.unique('userId', {
          name: `uq_${constraintPrefix}_member_user`,
        });
        collection.index('status', {
          name: `idx_${constraintPrefix}_member_status`,
        });
      });

      await reconcileAppAuthorization(context, definition);
    },
    async down(context: MigrationContext): Promise<void> {
      await context.query
        .deleteFrom('authorizationPermissionSetAssignments')
        .where(
          'permissionSetKey',
          'in',
          definition.roles.map((role) => role.key),
        )
        .execute();
      await context.query
        .deleteFrom('authorizationPermissionSets')
        .where(
          'key',
          'in',
          definition.roles.map((role) => role.key),
        )
        .execute();
      await context.query
        .deleteFrom('appAccessControlAuditLogs')
        .where('appKey', '=', definition.appKey)
        .execute();
      await context.builder.dropCollection(memberTableName);
    },
  });
}

/**
 * Bridges databases created by the pre-2026-08 authorization implementation
 * into the canonical Permission Set storage without deleting the legacy data.
 */
export function createAppAccessControlBridgeMigration(
  name: string,
  input: AppAccessControlDefinition,
): MigrationDefinition {
  const definition = normalizeAccessControlDefinition(input);
  return defineMigration({
    name,
    irreversible: true,
    async up(context: MigrationContext): Promise<void> {
      await ensureAuthorizationStorage(context);
      await ensureAccessControlAuditStorage(context);
      await reconcileAppAuthorization(context, definition, true);
    },
  });
}

async function ensureAccessControlAuditStorage(
  context: MigrationContext,
): Promise<void> {
  const knex = await context.connection.client<Knex>();
  if (await knex.schema.hasTable('appAccessControlAuditLogs')) return;
  await context.builder.createCollection(
    'appAccessControlAuditLogs',
    (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('appKey', { length: 128 }).notNull();
      collection.string('event', { length: 128 }).notNull();
      collection.string('actorId', { length: 64 }).notNull();
      collection.string('resourceId', { length: 255 }).notNull();
      collection.json('details').notNull();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_app_access_control_audit_logs' });
      collection.index(['appKey', 'event', 'createdAt'], {
        name: 'idx_app_access_control_audit_event',
      });
      collection.index(['appKey', 'actorId'], {
        name: 'idx_app_access_control_audit_actor',
      });
    },
  );
}

async function ensureAuthorizationStorage(
  context: MigrationContext,
): Promise<void> {
  await ensureMigrationTables(
    context,
    ['authorizationPermissionSets', 'authorizationPermissionSetAssignments'],
    permissionSetsMigration,
  );
  await ensureMigrationTables(
    context,
    [
      'authorizationDefaultAccessRules',
      'authorizationDefaultAccessRuleRecords',
    ],
    defaultAccessMigration,
  );
  await ensureMigrationTables(
    context,
    [
      'authorizationSharingRules',
      'authorizationSharingRuleRecords',
      'authorizationSharingRuleAssignments',
    ],
    sharingRulesMigration,
  );
  await ensureMigrationTables(
    context,
    [
      'authorizationRestrictionRules',
      'authorizationRestrictionRuleRecords',
      'authorizationRestrictionRuleAssignments',
    ],
    restrictionRulesMigration,
  );
}

async function ensureMigrationTables(
  context: MigrationContext,
  tableNames: readonly string[],
  migration: MigrationDefinition,
): Promise<void> {
  const knex = await context.connection.client<Knex>();
  const present = await Promise.all(
    tableNames.map((tableName) => knex.schema.hasTable(tableName)),
  );
  if (present.every(Boolean)) return;
  if (present.some(Boolean)) {
    throw new Error(
      `Authorization storage is incomplete: ${tableNames.filter((_table, index) => !present[index]).join(', ')}`,
    );
  }
  await migration.up(context);
}

async function reconcileAppAuthorization(
  context: MigrationContext,
  definition: ReturnType<typeof normalizeAccessControlDefinition>,
  migrateLegacy: boolean = false,
): Promise<void> {
  const knex = await context.connection.client<Knex>();
  const legacy = migrateLegacy
    ? await readLegacyAuthorization(knex, definition)
    : undefined;
  const now = new Date();

  for (const [index, role] of definition.roles.entries()) {
    const existing = await knex<PermissionSetKeyRow>(
      'authorizationPermissionSets',
    )
      .select('key')
      .where({ key: role.key })
      .first();
    if (existing) continue;
    await knex('authorizationPermissionSets').insert({
      id: `${definition.appKey}-role-${index + 1}`,
      key: role.key,
      title: legacy?.titles.get(role.key) ?? role.title,
      grants: JSON.stringify(
        legacy?.grants.get(role.key) ?? defaultRoleGrants(role),
      ),
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const assignment of legacy?.assignments ?? []) {
    const existing = await knex<AuthorizationAssignmentRow>(
      'authorizationPermissionSetAssignments',
    )
      .select('id')
      .where({
        subjectType: assignment.subjectType,
        subjectId: assignment.subjectId,
        permissionSetKey: assignment.permissionSetKey,
      })
      .first();
    if (existing) continue;
    await knex('authorizationPermissionSetAssignments').insert({
      id: `${definition.appKey}-${assignment.subjectType}-${assignment.subjectId}-${assignment.permissionSetKey}`,
      ...assignment,
      createdAt: now,
      updatedAt: now,
    });
  }
}

interface LegacyAuthorizationState {
  readonly assignments: readonly LegacyAssignment[];
  readonly grants: ReadonlyMap<string, readonly Record<string, unknown>[]>;
  readonly titles: ReadonlyMap<string, string>;
}

interface LegacyAssignment {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly permissionSetKey: string;
}

interface LegacyRoleRow {
  readonly id: unknown;
  readonly key: unknown;
  readonly title: unknown;
}

interface LegacyPermissionRow {
  readonly actions: unknown;
  readonly permissionSetId: unknown;
  readonly resource: unknown;
}

interface AuthorizationAssignmentRow {
  readonly id: unknown;
  readonly permissionSetKey: string;
  readonly subjectId: string;
  readonly subjectType: string;
}

interface PermissionSetKeyRow {
  readonly key: unknown;
}

async function readLegacyAuthorization(
  knex: Knex,
  definition: ReturnType<typeof normalizeAccessControlDefinition>,
): Promise<LegacyAuthorizationState | undefined> {
  const tables = await Promise.all(
    ['authzPermissionSets', 'authzObjectPermissions', 'authzAssignments'].map(
      (tableName) => knex.schema.hasTable(tableName),
    ),
  );
  if (!tables.every(Boolean)) return undefined;

  const roleKeys = definition.roles.map((role) => role.key);
  const roles = (await knex<LegacyRoleRow>('authzPermissionSets')
    .select(['id', 'key', 'title'])
    .whereIn('key', roleKeys)) as LegacyRoleRow[];
  const roleById = new Map(
    roles.map((role) => [String(role.id), String(role.key)]),
  );
  const permissions = roleById.size
    ? ((await knex<LegacyPermissionRow>('authzObjectPermissions')
        .select(['permissionSetId', 'resource', 'actions'])
        .whereIn('permissionSetId', [
          ...roleById.keys(),
        ])) as LegacyPermissionRow[])
    : [];
  const grants = new Map<string, Record<string, unknown>[]>();
  for (const permission of permissions) {
    const roleKey = roleById.get(String(permission.permissionSetId));
    if (!roleKey) continue;
    const roleGrants = grants.get(roleKey) ?? [];
    roleGrants.push(
      legacyPermissionGrant(String(permission.resource), permission.actions),
    );
    grants.set(roleKey, roleGrants);
  }
  const assignmentRows: unknown = await knex('authzAssignments as assignment')
    .innerJoin(
      'authzPermissionSets as permissionSet',
      'permissionSet.id',
      'assignment.targetId',
    )
    .where('assignment.targetType', 'permissionSet')
    .whereIn('permissionSet.key', roleKeys)
    .select([
      'assignment.subjectType',
      'assignment.subjectId',
      'permissionSet.key',
    ]);
  const assignments = Array.isArray(assignmentRows)
    ? assignmentRows.filter(isRecord)
    : [];

  return {
    assignments: assignments.map((assignment) => ({
      subjectType: String(assignment.subjectType),
      subjectId: String(assignment.subjectId),
      permissionSetKey: String(assignment.key),
    })),
    grants,
    titles: new Map(
      roles.map((role) => [String(role.key), String(role.title ?? role.key)]),
    ),
  };
}

function defaultRoleGrants(
  role: ReturnType<typeof normalizeAccessControlDefinition>['roles'][number],
): readonly Record<string, unknown>[] {
  return [
    ...role.permissions.map((permission) => toPermissionGrant(permission)),
    toPermissionGrant({ resource: 'user', capabilities: ['read'] }),
  ];
}

function legacyPermissionGrant(
  resource: string,
  value: unknown,
): Record<string, unknown> {
  const actions = parseJsonArray(value).flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.action !== 'string') return [];
    const recordAccess = Array.isArray(candidate.recordScope)
      ? candidate.recordScope.flatMap((scope) => {
          if (!isRecord(scope) || typeof scope.policy !== 'string') return [];
          return [
            scope.params === undefined
              ? scope.policy
              : { key: scope.policy, params: scope.params },
          ];
        })
      : [];
    return [
      {
        action: candidate.action,
        policy: {
          type: 'database',
          fields: {
            input: normalizeLegacyFields(candidate.inputFields),
            output: normalizeLegacyFields(candidate.outputFields),
          },
          ...(candidate.action === 'create' || recordAccess.length === 0
            ? {}
            : { recordAccess }),
        },
      },
    ];
  });
  return {
    resource: { type: 'database.collection', id: `main.${resource}` },
    actions,
  };
}

function normalizeLegacyFields(value: unknown): '*' | readonly string[] {
  return value === '*' ||
    (Array.isArray(value) && value.every((field) => typeof field === 'string'))
    ? value
    : '*';
}

function parseJsonArray(value: unknown): readonly unknown[] {
  const parsed =
    typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return Array.isArray(parsed) ? parsed : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamps(collection: CollectionDefinitionBuilder): void {
  collection.datetime('createdAt').notNull();
  collection.datetime('updatedAt').notNull();
}

function toPermissionGrant(
  permission: AppAccessDefaultPermission,
): Record<string, unknown> {
  const capabilities = new Set(permission.capabilities);
  const recordAccess = [
    permission.scope === 'own' ? 'recordsIOwn' : 'allRecords',
  ];
  const actions = [
    ...(capabilities.has('read') ? ['list', 'get', 'query'] : []),
    ...(capabilities.has('create') ? ['create'] : []),
    ...(capabilities.has('update') ? ['update'] : []),
    ...(capabilities.has('destroy') ? ['destroy'] : []),
  ];

  return {
    resource: {
      type: 'database.collection',
      id: `main.${permission.resource}`,
    },
    actions: actions.map((action) => ({
      action,
      ...(action === 'create'
        ? { policy: { type: 'database', fields: { input: '*', output: '*' } } }
        : {
            policy: {
              type: 'database',
              fields: { input: '*', output: '*' },
              recordAccess,
            },
          }),
    })),
  };
}
