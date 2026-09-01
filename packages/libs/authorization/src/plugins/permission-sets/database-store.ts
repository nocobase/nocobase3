import type { DatabaseConnection } from '@nocobase/db';
import type {
  PermissionGrant,
  PermissionSet,
  PermissionSetAssignment,
  PermissionSetSubject,
} from './model.js';
import type { PermissionSetStore } from './store.js';

export class DatabasePermissionSetStore implements PermissionSetStore {
  constructor(private readonly connection: DatabaseConnection) {}

  async listPermissionSets(): Promise<readonly PermissionSet[]> {
    const rows = await this.connection.query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'title', 'grants'])
      .orderBy('key', 'asc')
      .execute();
    return rows.map((row) => permissionSetFromRow(row));
  }

  async findAssignments(
    subjects: readonly PermissionSetSubject[],
  ): Promise<readonly PermissionSetAssignment[]> {
    if (subjects.length === 0) return [];
    const rows = await this.connection.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['id', 'subjectType', 'subjectId', 'permissionSetKey'])
      .where((builder) =>
        builder.or(
          subjects.map((subject) =>
            builder.and({
              subjectType: subject.type,
              subjectId: subject.id,
            }),
          ),
        ),
      )
      .execute();
    return rows.map((row) => ({
      id: String(row.id),
      subject: {
        type: String(row.subjectType),
        id: String(row.subjectId),
      },
      permissionSet: String(row.permissionSetKey),
    }));
  }

  async getPermissionSet(key: string): Promise<PermissionSet | undefined> {
    const row = await this.connection.query
      .selectFrom('authorizationPermissionSets')
      .select(['key', 'title', 'grants'])
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row) return undefined;
    return permissionSetFromRow(row);
  }

  async createPermissionSet(input: PermissionSet): Promise<PermissionSet> {
    const now = new Date();
    await this.connection.query
      .insertInto('authorizationPermissionSets')
      .values({
        id: crypto.randomUUID(),
        key: input.key,
        title: input.title ?? null,
        grants: JSON.stringify(input.grants),
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return input;
  }

  async updatePermissionSet(
    key: string,
    input: PermissionSet,
  ): Promise<PermissionSet> {
    await this.connection.transaction(async (connection): Promise<void> => {
      await connection.query
        .updateTable('authorizationPermissionSets')
        .set({
          key: input.key,
          title: input.title ?? null,
          grants: JSON.stringify(input.grants),
          updatedAt: new Date(),
        })
        .where('key', '=', key)
        .execute();
      if (key !== input.key) {
        await connection.query
          .updateTable('authorizationPermissionSetAssignments')
          .set({ permissionSetKey: input.key })
          .where('permissionSetKey', '=', key)
          .execute();
      }
    });
    return input;
  }

  async deletePermissionSet(key: string): Promise<void> {
    await this.connection.transaction(async (connection): Promise<void> => {
      await connection.query
        .deleteFrom('authorizationPermissionSetAssignments')
        .where('permissionSetKey', '=', key)
        .execute();
      await connection.query
        .deleteFrom('authorizationPermissionSets')
        .where('key', '=', key)
        .execute();
    });
  }

  async assignPermissionSet(
    input: PermissionSetAssignment,
  ): Promise<PermissionSetAssignment> {
    const now = new Date();
    await this.connection.query
      .insertInto('authorizationPermissionSetAssignments')
      .values({
        id: input.id,
        subjectType: input.subject.type,
        subjectId: input.subject.id,
        permissionSetKey: input.permissionSet,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    return input;
  }

  async revokeAssignment(id: string): Promise<void> {
    await this.connection.query
      .deleteFrom('authorizationPermissionSetAssignments')
      .where('id', '=', id)
      .execute();
  }

  async listAssignments(
    permissionSet?: string,
  ): Promise<readonly PermissionSetAssignment[]> {
    let query = this.connection.query
      .selectFrom('authorizationPermissionSetAssignments')
      .select(['id', 'subjectType', 'subjectId', 'permissionSetKey']);
    if (permissionSet !== undefined) {
      query = query.where('permissionSetKey', '=', permissionSet);
    }
    const rows = await query.orderBy('id', 'asc').execute();
    return rows.map((row) => assignmentFromRow(row));
  }
}

function permissionSetFromRow(row: object): PermissionSet {
  const key = rowValue(row, 'key');
  const title = rowValue(row, 'title');
  const grants = rowValue(row, 'grants');
  return {
    key: scalarString(key, 'Permission Set key'),
    ...(title == null
      ? {}
      : { title: scalarString(title, 'Permission Set title') }),
    grants: jsonValue<PermissionGrant[]>(grants, []),
  };
}

function assignmentFromRow(row: object): PermissionSetAssignment {
  return {
    id: scalarString(rowValue(row, 'id'), 'Permission Set assignment id'),
    subject: {
      type: scalarString(
        rowValue(row, 'subjectType'),
        'Permission Set subject type',
      ),
      id: scalarString(rowValue(row, 'subjectId'), 'Permission Set subject id'),
    },
    permissionSet: scalarString(
      rowValue(row, 'permissionSetKey'),
      'Permission Set assignment key',
    ),
  };
}

function rowValue(row: object, key: string): unknown {
  return Reflect.get(row, key);
}

function jsonValue<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
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
