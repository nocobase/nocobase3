import type { DatabaseConnection } from '@nocobase/database';
import type { DefaultAccessRule } from './model.js';
import type { DefaultAccessStore } from './store.js';

export class DatabaseDefaultAccessStore implements DefaultAccessStore {
  constructor(private readonly connection: DatabaseConnection) {}

  async list(): Promise<readonly DefaultAccessRule[]> {
    const rows = await this.connection.query
      .selectFrom('authorizationDefaultAccessRules')
      .select(['resourceType', 'resourceId', 'actions', 'scope'])
      .orderBy('resourceType', 'asc')
      .orderBy('resourceId', 'asc')
      .execute();
    return rows.map((row) => this.fromRow(row));
  }

  async get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined> {
    const row = await this.connection.query
      .selectFrom('authorizationDefaultAccessRules')
      .select(['resourceType', 'resourceId', 'actions', 'scope'])
      .where('resourceType', '=', resourceType)
      .where('resourceId', '=', resourceId)
      .executeTakeFirst();
    return row ? this.fromRow(row) : undefined;
  }

  async set(rule: DefaultAccessRule): Promise<DefaultAccessRule> {
    const existing = await this.get(rule.resource.type, rule.resource.id);
    const now = new Date();
    if (existing) {
      await this.connection.query
        .updateTable('authorizationDefaultAccessRules')
        .set({
          actions: JSON.stringify(rule.actions),
          scope: JSON.stringify(rule.scope),
          updatedAt: now,
        })
        .where('resourceType', '=', rule.resource.type)
        .where('resourceId', '=', rule.resource.id)
        .execute();
    } else {
      await this.connection.query
        .insertInto('authorizationDefaultAccessRules')
        .values({
          id: crypto.randomUUID(),
          resourceType: rule.resource.type,
          resourceId: rule.resource.id,
          actions: JSON.stringify(rule.actions),
          scope: JSON.stringify(rule.scope),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    return rule;
  }

  async delete(resourceType: string, resourceId: string): Promise<void> {
    await this.connection.query
      .deleteFrom('authorizationDefaultAccessRules')
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
      scope: parseJson(value.scope, { type: 'all' }),
    };
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}
