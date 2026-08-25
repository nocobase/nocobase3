import type { DatabaseConnection } from '@nocobase/app-database';
import type { RestrictionRule } from './model.js';
import type { RestrictionRuleStore } from './store.js';

const COLLECTION = 'authorizationRestrictionRules';
const RECORDS = 'authorizationRestrictionRuleRecords';
const ASSIGNMENTS = 'authorizationRestrictionRuleAssignments';

export class DatabaseRestrictionRuleStore implements RestrictionRuleStore {
  constructor(private readonly connection: DatabaseConnection) {}
  async create(rule: RestrictionRule): Promise<RestrictionRule> {
    const now = new Date();
    const id = crypto.randomUUID();
    await this.connection.transaction(async (connection): Promise<void> => {
      await connection.query
        .insertInto(COLLECTION)
        .values(this.toValues(rule, id, now, now))
        .execute();
      await this.replaceRecords(connection, id, rule.actions);
      await this.replaceAssignments(connection, id, rule.subjects);
    });
    return rule;
  }
  async update(key: string, rule: RestrictionRule): Promise<RestrictionRule> {
    await this.connection.transaction(async (connection): Promise<void> => {
      const row = await connection.query
        .selectFrom(COLLECTION)
        .select('id')
        .where('key', '=', key)
        .executeTakeFirst();
      if (!row) throw new Error(`Unknown Restriction Rule: ${key}`);
      const id = String(row.id);
      await connection.query
        .updateTable(COLLECTION)
        .set({ ...this.toUpdateValues(rule), updatedAt: new Date() })
        .where('id', '=', id)
        .execute();
      await connection.query
        .deleteFrom(RECORDS)
        .where('restrictionRuleId', '=', id)
        .execute();
      await connection.query
        .deleteFrom(ASSIGNMENTS)
        .where('restrictionRuleId', '=', id)
        .execute();
      await this.replaceRecords(connection, id, rule.actions);
      await this.replaceAssignments(connection, id, rule.subjects);
    });
    return rule;
  }
  async delete(key: string): Promise<void> {
    await this.connection.transaction(async (connection): Promise<void> => {
      const row = await connection.query
        .selectFrom(COLLECTION)
        .select('id')
        .where('key', '=', key)
        .executeTakeFirst();
      if (!row) return;
      await connection.query
        .deleteFrom(RECORDS)
        .where('restrictionRuleId', '=', String(row.id))
        .execute();
      await connection.query
        .deleteFrom(ASSIGNMENTS)
        .where('restrictionRuleId', '=', String(row.id))
        .execute();
      await connection.query
        .deleteFrom(COLLECTION)
        .where('id', '=', String(row.id))
        .execute();
    });
  }
  async get(key: string): Promise<RestrictionRule | undefined> {
    const row = await this.connection.query
      .selectFrom(COLLECTION)
      .select([
        'id',
        'key',
        'title',
        'resourceType',
        'resourceId',
        'actions',
        'reason',
      ])
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row) return undefined;
    return this.fromRow(
      row,
      await this.loadRecords([String(row.id)]),
      await this.loadAssignments([String(row.id)]),
    );
  }
  async list(): Promise<readonly RestrictionRule[]> {
    const rows = await this.connection.query
      .selectFrom(COLLECTION)
      .select([
        'id',
        'key',
        'title',
        'resourceType',
        'resourceId',
        'actions',
        'reason',
      ])
      .orderBy('key', 'asc')
      .execute();
    const ids = rows.map((row) => String(row.id));
    const records = await this.loadRecords(ids);
    const assignments = await this.loadAssignments(ids);
    return rows.map((row) => this.fromRow(row, records, assignments));
  }
  private toValues(
    rule: RestrictionRule,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): Record<string, unknown> {
    return { id, ...this.toUpdateValues(rule), createdAt, updatedAt };
  }
  private toUpdateValues(rule: RestrictionRule): Record<string, unknown> {
    return {
      key: rule.key,
      title: rule.title ?? null,
      resourceType: rule.resource.type,
      resourceId: rule.resource.id,
      actions: JSON.stringify(stripIds(rule.actions)),
      reason: rule.reason ?? null,
    };
  }
  private async replaceRecords(
    connection: DatabaseConnection,
    ruleId: string,
    actions: RestrictionRule['actions'],
  ): Promise<void> {
    const rows = actions.flatMap((item) => {
      const ids = scopeIds(item.scope);
      return ids
        ? ids.map((recordId) => ({
            id: crypto.randomUUID(),
            restrictionRuleId: ruleId,
            action: item.action,
            recordId,
            createdAt: new Date(),
          }))
        : [];
    });
    if (rows.length > 0)
      await connection.query.insertInto(RECORDS).values(rows).execute();
  }
  private async loadRecords(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (ids.length === 0) return new Map();
    const rows = await this.connection.query
      .selectFrom(RECORDS)
      .select(['restrictionRuleId', 'action', 'recordId'])
      .where('restrictionRuleId', 'in', ids)
      .execute();
    const result = new Map<string, string[]>();
    for (const row of rows) {
      const key = `${String(row.restrictionRuleId)}\u0000${String(row.action)}`;
      const values = result.get(key) ?? [];
      values.push(String(row.recordId));
      result.set(key, values);
    }
    return result;
  }
  private async replaceAssignments(
    connection: DatabaseConnection,
    ruleId: string,
    subjects: RestrictionRule['subjects'],
  ): Promise<void> {
    if (subjects.length > 0)
      await connection.query
        .insertInto(ASSIGNMENTS)
        .values(
          subjects.map((subject) => ({
            id: crypto.randomUUID(),
            restrictionRuleId: ruleId,
            subjectType: subject.type,
            subjectId: subject.id,
            createdAt: new Date(),
          })),
        )
        .execute();
  }
  private async loadAssignments(
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, RestrictionRule['subjects']>> {
    if (ids.length === 0) return new Map();
    const rows = await this.connection.query
      .selectFrom(ASSIGNMENTS)
      .select(['restrictionRuleId', 'subjectType', 'subjectId'])
      .where('restrictionRuleId', 'in', ids)
      .execute();
    const result = new Map<string, { type: string; id: string }[]>();
    for (const row of rows) {
      const id = String(row.restrictionRuleId);
      const values = result.get(id) ?? [];
      values.push({ type: String(row.subjectType), id: String(row.subjectId) });
      result.set(id, values);
    }
    return result;
  }
  private fromRow(
    row: object,
    records: ReadonlyMap<string, readonly string[]>,
    assignments: ReadonlyMap<string, RestrictionRule['subjects']>,
  ): RestrictionRule {
    const value = row as Record<string, unknown>;
    const title = optionalString(value.title, 'restriction rule title');
    const reason = optionalString(value.reason, 'restriction rule reason');
    return {
      key: String(value.key),
      ...(title === undefined ? {} : { title }),
      resource: {
        type: String(value.resourceType),
        id: String(value.resourceId),
      },
      actions: restoreIds(
        parseJson(value.actions, []),
        String(value.id),
        records,
      ),
      subjects: assignments.get(String(value.id)) ?? [],
      ...(reason === undefined ? {} : { reason }),
    };
  }
}

function scopeIds(
  scope: RestrictionRule['actions'][number]['scope'],
): readonly string[] | undefined {
  if (scope.type !== 'ids') return undefined;
  const ids = Reflect.get(scope, 'ids');
  return Array.isArray(ids) && ids.every((item) => typeof item === 'string')
    ? ids
    : undefined;
}

function stripIds(
  actions: RestrictionRule['actions'],
): RestrictionRule['actions'] {
  return actions.map((item) =>
    item.scope.type === 'ids'
      ? { ...item, scope: { type: 'ids', ids: [] } }
      : item,
  );
}
function restoreIds(
  actions: RestrictionRule['actions'],
  ruleId: string,
  records: ReadonlyMap<string, readonly string[]>,
): RestrictionRule['actions'] {
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

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  return typeof value === 'string' ? (JSON.parse(value) as T) : (value as T);
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  throw new Error(`Invalid ${label}`);
}
