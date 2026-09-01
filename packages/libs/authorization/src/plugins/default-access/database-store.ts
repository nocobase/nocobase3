import type { DatabaseConnection } from '@nocobase/db';
import type { DefaultAccessRule } from './model.js';
import type { DefaultAccessStore } from './store.js';

export class DatabaseDefaultAccessStore implements DefaultAccessStore {
  constructor(private readonly connection: DatabaseConnection) {}

  async list(): Promise<readonly DefaultAccessRule[]> {
    const rows = await this.connection.query
      .selectFrom('authorizationDefaultAccessRules')
      .select(['id', 'resourceType', 'resourceId', 'actions'])
      .orderBy('resourceType', 'asc')
      .orderBy('resourceId', 'asc')
      .execute();
    const records = await this.loadRecords(rows.map((row) => String(row.id)));
    return rows.map((row) => this.fromRow(row, records));
  }

  async get(
    resourceType: string,
    resourceId: string,
  ): Promise<DefaultAccessRule | undefined> {
    const row = await this.connection.query
      .selectFrom('authorizationDefaultAccessRules')
      .select(['id', 'resourceType', 'resourceId', 'actions'])
      .where('resourceType', '=', resourceType)
      .where('resourceId', '=', resourceId)
      .executeTakeFirst();
    if (!row) return undefined;
    return this.fromRow(row, await this.loadRecords([String(row.id)]));
  }

  async set(rule: DefaultAccessRule): Promise<DefaultAccessRule> {
    const now = new Date();
    await this.connection.transaction(async (connection): Promise<void> => {
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
            actions: JSON.stringify(stripIds(rule.actions)),
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
            actions: JSON.stringify(stripIds(rule.actions)),
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      await connection.query
        .deleteFrom('authorizationDefaultAccessRuleRecords')
        .where('defaultAccessRuleId', '=', id)
        .execute();
      await insertRecords(
        connection,
        'authorizationDefaultAccessRuleRecords',
        'defaultAccessRuleId',
        id,
        rule.actions,
      );
    });
    return rule;
  }

  async delete(resourceType: string, resourceId: string): Promise<void> {
    await this.connection.transaction(async (connection): Promise<void> => {
      const row = await connection.query
        .selectFrom('authorizationDefaultAccessRules')
        .select('id')
        .where('resourceType', '=', resourceType)
        .where('resourceId', '=', resourceId)
        .executeTakeFirst();
      if (!row) return;
      await connection.query
        .deleteFrom('authorizationDefaultAccessRuleRecords')
        .where('defaultAccessRuleId', '=', String(row.id))
        .execute();
      await connection.query
        .deleteFrom('authorizationDefaultAccessRules')
        .where('id', '=', String(row.id))
        .execute();
    });
  }

  private async loadRecords(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (ids.length === 0) return new Map();
    const rows = await this.connection.query
      .selectFrom('authorizationDefaultAccessRuleRecords')
      .select(['defaultAccessRuleId', 'action', 'recordId'])
      .where('defaultAccessRuleId', 'in', ids)
      .execute();
    return groupRecords(rows, 'defaultAccessRuleId');
  }

  private fromRow(
    row: object,
    records: ReadonlyMap<string, readonly string[]>,
  ): DefaultAccessRule {
    const value = row as Record<string, unknown>;
    return {
      resource: {
        type: String(value.resourceType),
        id: String(value.resourceId),
      },
      actions: restoreIds(
        parseJson(value.actions, []),
        String(value.id),
        records,
      ),
    };
  }
}

type ScopedAction = DefaultAccessRule['actions'][number];
function stripIds(actions: readonly ScopedAction[]): readonly ScopedAction[] {
  return actions.map((item) =>
    item.scope.type === 'ids'
      ? { ...item, scope: { type: 'ids', ids: [] } }
      : item,
  );
}
function restoreIds(
  actions: readonly ScopedAction[],
  ruleId: string,
  records: ReadonlyMap<string, readonly string[]>,
): readonly ScopedAction[] {
  return actions.map((item) =>
    item.scope.type === 'ids'
      ? {
          ...item,
          scope: {
            type: 'ids',
            ids: records.get(`${ruleId}\u0000${item.action}`) ?? [],
          },
        }
      : item,
  );
}
async function insertRecords(
  connection: DatabaseConnection,
  table: string,
  foreignKey: string,
  ruleId: string,
  actions: readonly ScopedAction[],
): Promise<void> {
  const rows = actions.flatMap((item) => {
    const ids = scopeIds(item.scope);
    return ids
      ? ids.map((recordId) => ({
          id: crypto.randomUUID(),
          [foreignKey]: ruleId,
          action: item.action,
          recordId,
          createdAt: new Date(),
        }))
      : [];
  });
  if (rows.length > 0)
    await connection.query.insertInto(table).values(rows).execute();
}
function scopeIds(scope: ScopedAction['scope']): readonly string[] | undefined {
  if (scope.type !== 'ids') return undefined;
  const ids = Reflect.get(scope, 'ids');
  return Array.isArray(ids) && ids.every((item) => typeof item === 'string')
    ? ids
    : undefined;
}
function groupRecords(
  rows: readonly object[],
  foreignKey: string,
): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const row of rows) {
    const value = row as Record<string, unknown>;
    const key = `${String(value[foreignKey])}\u0000${String(value.action)}`;
    const items = result.get(key) ?? [];
    items.push(String(value.recordId));
    result.set(key, items);
  }
  return result;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}
