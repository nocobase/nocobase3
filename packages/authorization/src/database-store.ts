import type { DatabaseConnection, Row } from '@nocobase/app-database';
import { filter, membership } from './filter.js';
import type { AuthorizationStore } from './store.js';
import type {
  Assignment,
  AssignmentSubject,
  AssignmentSubjectType,
  ActionPermission,
  FilterAst,
  FilterMembershipNode,
  ObjectPermission,
  OrganizationWideAccess,
  OrganizationWideDefault,
  PermissionSet,
  PermissionSetGroup,
  RestrictionRule,
  SharingRule,
} from './types.js';

function jsonValue<T>(value: unknown, fallback: T): T {
  if (value == null) {
    return fallback;
  }
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}

function optionalDate(value: unknown): Date | undefined {
  if (value == null) {
    return undefined;
  }
  return value instanceof Date ? value : new Date(value as string | number);
}

export class DatabaseAuthorizationStore implements AuthorizationStore {
  constructor(private readonly connection: DatabaseConnection) {}

  async findAssignments(
    subjects: readonly AssignmentSubject[],
    now: Date,
  ): Promise<Assignment[]> {
    if (!subjects.length) {
      return [];
    }
    const rows = await this.connection.query
      .selectFrom('authzAssignments')
      .select([
        'id',
        'subjectType',
        'subjectId',
        'targetType',
        'targetId',
        'startsAt',
        'expiresAt',
      ])
      .where((eb) =>
        eb.or(
          subjects.map((subject) =>
            eb.and({
              subjectType: subject.type,
              subjectId: subject.id,
            }),
          ),
        ),
      )
      .execute();

    const assignments: Assignment[] = [];
    for (const row of rows) {
      const startsAt = optionalDate(row.startsAt);
      const expiresAt = optionalDate(row.expiresAt);
      if ((startsAt && startsAt > now) || (expiresAt && expiresAt <= now)) {
        continue;
      }
      const targetType = row.targetType as
        'permissionSet' | 'permissionSetGroup';
      const collection =
        targetType === 'permissionSet'
          ? 'authzPermissionSets'
          : 'authzPermissionSetGroups';
      const target = await this.connection.query
        .selectFrom(collection)
        .select('key')
        .where('id', '=', row.targetId)
        .executeTakeFirst();
      if (!target) {
        throw new Error(
          `Unknown ${targetType} assignment target: ${String(row.targetId)}`,
        );
      }
      assignments.push({
        id: String(row.id),
        subject: {
          type: row.subjectType as AssignmentSubjectType,
          id: String(row.subjectId),
        },
        target: { type: targetType, key: String(target.key) },
        ...(startsAt ? { startsAt } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      });
    }
    return assignments;
  }

  async getPermissionSet(key: string): Promise<PermissionSet | undefined> {
    const set = await this.connection.query
      .selectFrom('authzPermissionSets')
      .select(['id', 'key', 'title'])
      .where('key', '=', key)
      .executeTakeFirst();
    if (!set) {
      return undefined;
    }
    const rows = await this.connection.query
      .selectFrom('authzObjectPermissions')
      .select(['resource', 'actions'])
      .where('permissionSetId', '=', set.id)
      .execute();
    return {
      id: String(set.id),
      key: String(set.key),
      title: optionalScalarString(set.title, 'permission set title'),
      permissions: rows.map((row) => this.toObjectPermission(row)),
    };
  }

  async getPermissionSetGroup(
    key: string,
  ): Promise<PermissionSetGroup | undefined> {
    const group = await this.connection.query
      .selectFrom('authzPermissionSetGroups')
      .select(['id', 'key', 'title'])
      .where('key', '=', key)
      .executeTakeFirst();
    if (!group) {
      return undefined;
    }
    const items = await this.connection.query
      .selectFrom('authzPermissionSetGroupItems')
      .select('permissionSetId')
      .where('permissionSetGroupId', '=', group.id)
      .execute();
    const keys: string[] = [];
    for (const item of items) {
      const set = await this.connection.query
        .selectFrom('authzPermissionSets')
        .select('key')
        .where('id', '=', item.permissionSetId)
        .executeTakeFirst();
      if (!set) {
        throw new Error(
          `Unknown Permission Set Group item: ${String(item.permissionSetId)}`,
        );
      }
      keys.push(String(set.key));
    }
    return {
      id: String(group.id),
      key: String(group.key),
      title: optionalScalarString(group.title, 'permission set group title'),
      permissionSets: keys,
    };
  }

  async getOrganizationWideDefault(
    resource: string,
  ): Promise<OrganizationWideDefault | undefined> {
    const row = await this.connection.query
      .selectFrom('authzOrganizationWideDefaults')
      .select('access')
      .where('resource', '=', resource)
      .executeTakeFirst();
    if (!row) {
      return undefined;
    }
    return {
      access: row.access as OrganizationWideAccess,
    };
  }

  async findSharingRules(
    subjects: readonly AssignmentSubject[],
    resource: string,
    action: string,
    now: Date,
  ): Promise<SharingRule[]> {
    const subjectKeys = new Set(
      subjects.map((subject) => `${subject.type}:${subject.id}`),
    );
    const rows = await this.connection.query
      .selectFrom('authzSharingRules')
      .select([
        'id',
        'key',
        'title',
        'resource',
        'actions',
        'subjects',
        'recordType',
        'scopes',
        'startsAt',
        'expiresAt',
        'reason',
      ])
      .where('resource', '=', resource)
      .execute();
    const candidates = rows.flatMap((row) => {
      const actions = jsonValue<string[]>(row.actions, []);
      const ruleSubjects = jsonValue<AssignmentSubject[]>(row.subjects, []);
      const startsAt = optionalDate(row.startsAt);
      const expiresAt = optionalDate(row.expiresAt);
      if (
        !actions.includes(action) ||
        !ruleSubjects.some((subject) =>
          subjectKeys.has(`${subject.type}:${subject.id}`),
        ) ||
        (startsAt && startsAt > now) ||
        (expiresAt && expiresAt <= now)
      ) {
        return [];
      }
      return [{ row, actions, ruleSubjects, startsAt, expiresAt }];
    });
    return candidates.map(
      ({ row, actions, ruleSubjects, startsAt, expiresAt }) => {
        let records: SharingRule['records'];
        if (row.recordType === 'criteria') {
          records = { type: 'criteria', scopes: jsonValue(row.scopes, []) };
        } else if (row.recordType === 'records') {
          records = { type: 'records', ids: [] };
        } else {
          throw new Error(
            `Unknown Sharing Rule record type: ${String(row.recordType)}`,
          );
        }
        return {
          id: String(row.id),
          key: String(row.key),
          ...(row.title == null
            ? {}
            : { title: scalarString(row.title, 'sharing rule title') }),
          resource: String(row.resource),
          actions,
          subjects: ruleSubjects,
          records,
          ...(startsAt ? { startsAt } : {}),
          ...(expiresAt ? { expiresAt } : {}),
          ...(row.reason == null
            ? {}
            : { reason: scalarString(row.reason, 'sharing rule reason') }),
        };
      },
    );
  }

  async createExplicitSharingFilter(
    rule: SharingRule,
    collection: string,
    identifier: string,
  ): Promise<FilterAst | undefined> {
    if (rule.records.type !== 'records') {
      return undefined;
    }
    if (!rule.id) {
      throw new Error(
        `Explicit Sharing Rule "${rule.key}" has no persistent id`,
      );
    }
    return filter(
      collection,
      membership(identifier, {
        collection: 'authzSharingRuleRecords',
        field: 'recordId',
        where: { sharingRuleId: rule.id },
      }),
    );
  }

  async matchesFilterMembership(
    node: FilterMembershipNode,
    value: unknown,
  ): Promise<boolean> {
    if (value == null) {
      return false;
    }
    if (
      node.source.collection !== 'authzSharingRuleRecords' ||
      node.source.field !== 'recordId'
    ) {
      throw new Error(
        `Unsupported authorization membership source: ${node.source.collection}.${node.source.field}`,
      );
    }
    const sharingRuleId = node.source.where.sharingRuleId;
    if (typeof sharingRuleId !== 'string') {
      throw new Error('Sharing membership requires sharingRuleId');
    }
    const row = await this.connection.query
      .selectFrom('authzSharingRuleRecords')
      .select('id')
      .where('sharingRuleId', '=', sharingRuleId)
      .where('recordId', '=', scalarString(value, 'sharing record id'))
      .executeTakeFirst();
    return Boolean(row);
  }

  async findRestrictionRules(
    subjects: readonly AssignmentSubject[],
    resource: string,
    action: string,
  ): Promise<RestrictionRule[]> {
    const subjectKeys = new Set(
      subjects.map((subject) => `${subject.type}:${subject.id}`),
    );
    const rows = await this.connection.query
      .selectFrom('authzRestrictionRules')
      .select([
        'id',
        'key',
        'title',
        'resource',
        'actions',
        'subjects',
        'scopes',
      ])
      .where('resource', '=', resource)
      .execute();
    return rows.flatMap((row) => {
      const actions = jsonValue<string[]>(row.actions, []);
      const ruleSubjects = jsonValue<AssignmentSubject[]>(row.subjects, []);
      if (
        !actions.includes(action) ||
        !ruleSubjects.some((subject) =>
          subjectKeys.has(`${subject.type}:${subject.id}`),
        )
      ) {
        return [];
      }
      return [
        {
          id: String(row.id),
          key: String(row.key),
          title: optionalScalarString(row.title, 'restriction rule title'),
          resource: String(row.resource),
          actions,
          subjects: ruleSubjects,
          scopes: jsonValue<RestrictionRule['scopes']>(row.scopes, []),
        },
      ];
    });
  }

  private toObjectPermission(row: Row): ObjectPermission {
    return {
      resource: String(row.resource),
      actions: jsonValue<ActionPermission[]>(row.actions, []),
    };
  }
}

function optionalScalarString(
  value: unknown,
  label: string,
): string | undefined {
  return value == null ? undefined : scalarString(value, label);
}

function scalarString(value: unknown, label: string): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  throw new Error(`Invalid ${label}`);
}
