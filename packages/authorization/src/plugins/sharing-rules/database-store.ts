import type { DatabaseConnection } from '@nocobase/database';
import type { SharingRule, SharingSelection } from './model.js';
import type { SharingRuleStore } from './store.js';

const RULES = 'authorizationSharingRules';
const RECORDS = 'authorizationSharingRuleRecords';

export class DatabaseSharingRuleStore implements SharingRuleStore {
  constructor(private readonly connection: DatabaseConnection) {}

  async create(rule: SharingRule): Promise<SharingRule> {
    const id = crypto.randomUUID();
    const now = new Date();
    await this.connection.transaction(async (connection): Promise<void> => {
      await connection.query
        .insertInto(RULES)
        .values(this.toValues(rule, id, now, now))
        .execute();
      await this.replaceRecords(connection, id, rule.selection);
    });
    return rule;
  }

  async update(key: string, rule: SharingRule): Promise<SharingRule> {
    await this.connection.transaction(async (connection): Promise<void> => {
      const current = await connection.query
        .selectFrom(RULES)
        .select('id')
        .where('key', '=', key)
        .executeTakeFirst();
      if (!current) throw new Error(`Unknown Sharing Rule: ${key}`);
      const id = String(current.id);
      await connection.query
        .updateTable(RULES)
        .set(this.toUpdateValues(rule))
        .where('id', '=', id)
        .execute();
      await connection.query
        .deleteFrom(RECORDS)
        .where('sharingRuleId', '=', id)
        .execute();
      await this.replaceRecords(connection, id, rule.selection);
    });
    return rule;
  }

  async delete(key: string): Promise<void> {
    await this.connection.transaction(async (connection): Promise<void> => {
      const current = await connection.query
        .selectFrom(RULES)
        .select('id')
        .where('key', '=', key)
        .executeTakeFirst();
      if (!current) return;
      const id = String(current.id);
      await connection.query
        .deleteFrom(RECORDS)
        .where('sharingRuleId', '=', id)
        .execute();
      await connection.query.deleteFrom(RULES).where('id', '=', id).execute();
    });
  }

  async get(key: string): Promise<SharingRule | undefined> {
    const row = await this.connection.query
      .selectFrom(RULES)
      .select([
        'id',
        'key',
        'title',
        'resourceType',
        'resourceId',
        'actions',
        'subjects',
        'selectionType',
        'scope',
        'reason',
      ])
      .where('key', '=', key)
      .executeTakeFirst();
    if (!row) return undefined;
    const records = await this.loadRecords([String(row.id)]);
    return this.fromRow(row, records);
  }

  async list(): Promise<readonly SharingRule[]> {
    const rows = await this.connection.query
      .selectFrom(RULES)
      .select([
        'id',
        'key',
        'title',
        'resourceType',
        'resourceId',
        'actions',
        'subjects',
        'selectionType',
        'scope',
        'reason',
      ])
      .orderBy('key', 'asc')
      .execute();
    const records = await this.loadRecords(rows.map((row) => String(row.id)));
    return rows.map((row) => this.fromRow(row, records));
  }

  private async replaceRecords(
    connection: DatabaseConnection,
    sharingRuleId: string,
    selection: SharingSelection,
  ): Promise<void> {
    if (selection.type !== 'records' || selection.recordIds.length === 0) {
      return;
    }
    const now = new Date();
    await connection.query
      .insertInto(RECORDS)
      .values(
        selection.recordIds.map((recordId) => ({
          id: crypto.randomUUID(),
          sharingRuleId,
          recordId,
          createdAt: now,
        })),
      )
      .execute();
  }

  private async loadRecords(
    ruleIds: readonly string[],
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (ruleIds.length === 0) return new Map();
    const rows = await this.connection.query
      .selectFrom(RECORDS)
      .select(['sharingRuleId', 'recordId'])
      .where('sharingRuleId', 'in', ruleIds)
      .orderBy('recordId', 'asc')
      .execute();
    const result = new Map<string, string[]>();
    for (const row of rows) {
      const id = String(row.sharingRuleId);
      const values = result.get(id) ?? [];
      values.push(String(row.recordId));
      result.set(id, values);
    }
    return result;
  }

  private toValues(
    rule: SharingRule,
    id: string,
    createdAt: Date,
    updatedAt: Date,
  ): Record<string, unknown> {
    return {
      id,
      ...this.toUpdateValues(rule),
      createdAt,
      updatedAt,
    };
  }

  private toUpdateValues(rule: SharingRule): Record<string, unknown> {
    return {
      key: rule.key,
      title: rule.title ?? null,
      resourceType: rule.resource.type,
      resourceId: rule.resource.id,
      actions: JSON.stringify(rule.actions),
      subjects: JSON.stringify(rule.subjects),
      selectionType: rule.selection.type,
      scope:
        rule.selection.type === 'criteria'
          ? JSON.stringify(rule.selection.scope)
          : null,
      reason: rule.reason ?? null,
      updatedAt: new Date(),
    };
  }

  private fromRow(
    row: object,
    records: ReadonlyMap<string, readonly string[]>,
  ): SharingRule {
    const value = row as Record<string, unknown>;
    const title = optionalString(value.title, 'sharing rule title');
    const reason = optionalString(value.reason, 'sharing rule reason');
    const selection: SharingSelection =
      value.selectionType === 'records'
        ? { type: 'records', recordIds: records.get(String(value.id)) ?? [] }
        : { type: 'criteria', scope: parseJson(value.scope, { type: 'all' }) };
    return {
      key: String(value.key),
      ...(title === undefined ? {} : { title }),
      resource: {
        type: String(value.resourceType),
        id: String(value.resourceId),
      },
      actions: parseJson(value.actions, []),
      subjects: parseJson(value.subjects, []),
      selection,
      ...(reason === undefined ? {} : { reason }),
    };
  }
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
