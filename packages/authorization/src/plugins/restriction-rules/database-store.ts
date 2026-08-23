import type { DatabaseConnection } from '@nocobase/database';
import type { RestrictionRule } from './model.js';
import type { RestrictionRuleStore } from './store.js';

const COLLECTION = 'authorizationRestrictionRules';

export class DatabaseRestrictionRuleStore implements RestrictionRuleStore {
  constructor(private readonly connection: DatabaseConnection) {}
  async create(rule: RestrictionRule): Promise<RestrictionRule> {
    const now = new Date();
    await this.connection.query
      .insertInto(COLLECTION)
      .values(this.toValues(rule, crypto.randomUUID(), now, now))
      .execute();
    return rule;
  }
  async update(key: string, rule: RestrictionRule): Promise<RestrictionRule> {
    await this.connection.query
      .updateTable(COLLECTION)
      .set({ ...this.toUpdateValues(rule), updatedAt: new Date() })
      .where('key', '=', key)
      .execute();
    return rule;
  }
  async delete(key: string): Promise<void> {
    await this.connection.query
      .deleteFrom(COLLECTION)
      .where('key', '=', key)
      .execute();
  }
  async get(key: string): Promise<RestrictionRule | undefined> {
    const row = await this.connection.query
      .selectFrom(COLLECTION)
      .select([
        'key',
        'title',
        'resourceType',
        'resourceId',
        'actions',
        'subjects',
        'scope',
        'reason',
      ])
      .where('key', '=', key)
      .executeTakeFirst();
    return row ? this.fromRow(row) : undefined;
  }
  async list(): Promise<readonly RestrictionRule[]> {
    const rows = await this.connection.query
      .selectFrom(COLLECTION)
      .select([
        'key',
        'title',
        'resourceType',
        'resourceId',
        'actions',
        'subjects',
        'scope',
        'reason',
      ])
      .orderBy('key', 'asc')
      .execute();
    return rows.map((row) => this.fromRow(row));
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
      actions: JSON.stringify(rule.actions),
      subjects: JSON.stringify(rule.subjects),
      scope: JSON.stringify(rule.scope),
      reason: rule.reason ?? null,
    };
  }
  private fromRow(row: object): RestrictionRule {
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
      actions: parseJson(value.actions, []),
      subjects: parseJson(value.subjects, []),
      scope: parseJson(value.scope, { type: 'all' }),
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
