import type { DatabaseConnection } from '@nocobase/db';
import type { DatabaseConnectionSource } from '@nocobase/app-plugin-authorization/server/management';
import type { DefaultAccessRule } from '@nocobase/authorization/default-access';
import type { DefaultAccessStore } from '@nocobase/authorization/default-access';

export class DatabaseDefaultAccessStore implements DefaultAccessStore<DatabaseConnection> {
  constructor(private readonly connection: DatabaseConnectionSource) {}

  withTransaction(
    connection: DatabaseConnection,
  ): DefaultAccessStore<DatabaseConnection> {
    return new DatabaseDefaultAccessStore(() => connection);
  }

  async list(): Promise<readonly DefaultAccessRule[]> {
    const rows = await this.connection()
      .query.selectFrom('authorizationDefaultAccessRules')
      .select(['id', 'resourceType', 'resourceId', 'actions'])
      .orderBy('resourceType', 'asc')
      .orderBy('resourceId', 'asc')
      .execute();
    return rows.map((row) => this.fromRow(row));
  }

  async get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined> {
    const row = await this.connection()
      .query.selectFrom('authorizationDefaultAccessRules')
      .select(['id', 'resourceType', 'resourceId', 'actions'])
      .where('resourceType', '=', resourceType)
      .where('resourceId', '=', resourceId)
      .executeTakeFirst();
    if (!row) return undefined;
    return this.fromRow(row);
  }

  async set(rule: DefaultAccessRule): Promise<DefaultAccessRule> {
    const now = new Date();
    await this.connection().transaction(async (connection): Promise<void> => {
      const existing = await connection.query
        .selectFrom('authorizationDefaultAccessRules')
        .select('id')
        .where('resourceType', '=', rule.resource.type)
        .where('resourceId', '=', rule.resource.id)
        .executeTakeFirst();
      const id = existing ? String(existing.id) : crypto.randomUUID();
      if (existing)
        await connection.query
          .updateTable('authorizationDefaultAccessRules')
          .set({
            actions: JSON.stringify(rule.actions),
            updatedAt: now,
          })
          .where('resourceType', '=', rule.resource.type)
          .where('resourceId', '=', rule.resource.id)
          .execute();
      else
        await connection.query
          .insertInto('authorizationDefaultAccessRules')
          .values({
            id,
            resourceType: rule.resource.type,
            resourceId: rule.resource.id,
            actions: JSON.stringify(rule.actions),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
    });
    return rule;
  }

  async delete(resourceType: string, resourceId: string): Promise<void> {
    await this.connection()
      .query.deleteFrom('authorizationDefaultAccessRules')
      .where('resourceType', '=', resourceType)
      .where('resourceId', '=', resourceId)
      .execute();
  }

  private fromRow(row: object): DefaultAccessRule {
    const value = row as Record<string, unknown>;
    return {
      resource: {
        type: String(value.resourceType),
        id: String(value.resourceId),
      },
      actions: parseJson(value.actions, []),
    };
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}
