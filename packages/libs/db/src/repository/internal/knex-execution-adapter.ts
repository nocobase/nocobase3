import type { Knex } from 'knex';
import type {
  AnyFieldDefinition,
  CollectionDefinition,
  FieldDefinition,
} from '../../collection/types.js';
import { DefaultNamingStrategy } from '../../naming/default-strategy.js';
import type {
  FilterAst,
  FilterConditionNode,
  FilterGroupNode,
  FilterNode,
  FilterValue,
  RepositoryRecord,
  SortItemNode,
  UniqueSelector,
} from '../types.js';
import type {
  RepositoryCreateManyPlan,
  RepositoryCreateOnePlan,
  RepositoryDeleteManyPlan,
  RepositoryDeleteOnePlan,
  RepositoryExecutedMutation,
  RepositoryExecutionAdapter,
  RepositoryFilterPlan,
  RepositoryReadPlan,
  RepositoryUpdateManyPlan,
  RepositoryUpdateOnePlan,
} from './execution-adapter.js';

export class KnexRepositoryExecutionAdapter implements RepositoryExecutionAdapter {
  constructor(private readonly getClient: () => Knex) {}

  async findMany(plan: RepositoryReadPlan): Promise<RepositoryRecord[]> {
    return this.buildRead(plan);
  }

  async findOne(
    plan: RepositoryReadPlan,
  ): Promise<RepositoryRecord | undefined> {
    return this.buildRead(plan).first();
  }

  async count(plan: RepositoryFilterPlan): Promise<number> {
    const query = tableQuery(this.getClient(), plan.collection).count({
      count: '*',
    });
    applyFilter(query, plan.collection, plan.filter?.root);
    const row = (await query.first()) as
      { count?: string | number } | undefined;
    return Number(row?.count ?? 0);
  }

  async exists(plan: RepositoryFilterPlan): Promise<boolean> {
    const client = this.getClient();
    const query = tableQuery(client, plan.collection).select(
      client.raw('1 as value'),
    );
    applyFilter(query, plan.collection, plan.filter?.root);
    return (await query.first()) !== undefined;
  }

  async createOne(
    plan: RepositoryCreateOnePlan,
  ): Promise<RepositoryExecutedMutation> {
    return this.inTransaction((adapter) => adapter.executeCreateOne(plan));
  }

  private async executeCreateOne(
    plan: RepositoryCreateOnePlan,
  ): Promise<RepositoryExecutedMutation> {
    const values = withInitialVersion(plan.collection, plan.values);
    const query = tableQuery(this.getClient(), plan.collection).insert(
      mapWrite(plan.collection, values),
    );
    const returned = (await query.returning(
      plan.fields.map((field) => column(plan.collection, field)),
    )) as unknown;
    const returnedRow = firstReturnedRow(returned);
    const record = returnedRow
      ? mapRow(plan.collection, plan.fields, returnedRow)
      : await this.reloadCreated(plan, values, returned);
    return { record, version: versionOf(plan.collection, record) };
  }

  async createMany(plan: RepositoryCreateManyPlan): Promise<number> {
    const records = plan.records.map((record) =>
      mapWrite(plan.collection, withInitialVersion(plan.collection, record)),
    );
    const result = (await tableQuery(this.getClient(), plan.collection).insert(
      records,
    )) as unknown;
    return insertedCount(result, records.length);
  }

  async updateOne(
    plan: RepositoryUpdateOnePlan,
  ): Promise<RepositoryExecutedMutation | undefined> {
    return this.inTransaction((adapter) => adapter.executeUpdateOne(plan));
  }

  private async executeUpdateOne(
    plan: RepositoryUpdateOnePlan,
  ): Promise<RepositoryExecutedMutation | undefined> {
    const query = tableQuery(this.getClient(), plan.collection).update(
      mapWrite(plan.collection, plan.values),
    );
    applyUnique(query, plan.collection, plan.unique);
    applyVersion(query, plan.collection, plan.ifVersion);
    incrementVersion(query, plan.collection);
    if (affectedCount(await query) === 0) return undefined;
    const record = await this.findOne({
      collection: plan.collection,
      fields: plan.fields,
      filter: uniqueFilter(plan.unique),
    });
    return record
      ? { record, version: versionOf(plan.collection, record) }
      : undefined;
  }

  async updateMany(plan: RepositoryUpdateManyPlan): Promise<number> {
    const query = tableQuery(this.getClient(), plan.collection).update(
      mapWrite(plan.collection, plan.values),
    );
    if (plan.filter) applyFilter(query, plan.collection, plan.filter.root);
    incrementVersion(query, plan.collection);
    return affectedCount(await query);
  }

  async deleteOne(
    plan: RepositoryDeleteOnePlan,
  ): Promise<'deleted' | 'missing' | 'conflict'> {
    return this.inTransaction((adapter) => adapter.executeDeleteOne(plan));
  }

  private async executeDeleteOne(
    plan: RepositoryDeleteOnePlan,
  ): Promise<'deleted' | 'missing' | 'conflict'> {
    if (plan.ifVersion !== undefined) {
      const existing = await this.findByUnique(plan.collection, plan.unique);
      if (!existing) return 'missing';
      if (versionOf(plan.collection, existing) !== plan.ifVersion) {
        return 'conflict';
      }
    }
    const query = tableQuery(this.getClient(), plan.collection).delete();
    applyUnique(query, plan.collection, plan.unique);
    applyVersion(query, plan.collection, plan.ifVersion);
    if (affectedCount(await query) > 0) return 'deleted';
    return plan.ifVersion === undefined ? 'missing' : 'conflict';
  }

  async deleteMany(plan: RepositoryDeleteManyPlan): Promise<number> {
    const query = tableQuery(this.getClient(), plan.collection).delete();
    if (plan.filter) applyFilter(query, plan.collection, plan.filter.root);
    return affectedCount(await query);
  }

  private buildRead(plan: RepositoryReadPlan): Knex.QueryBuilder {
    const client = this.getClient();
    const query = tableQuery(client, plan.collection).select(
      plan.fields.map((field) =>
        client.ref(column(plan.collection, field)).as(field),
      ),
    );
    applyFilter(query, plan.collection, plan.filter?.root);
    for (const item of plan.sort?.items ?? []) {
      applySort(query, plan.collection, item);
    }
    if (plan.limit !== undefined) query.limit(plan.limit);
    if (plan.offset !== undefined) query.offset(plan.offset);
    return query;
  }

  private async reloadCreated(
    plan: RepositoryCreateOnePlan,
    values: RepositoryRecord,
    returned: unknown,
  ): Promise<RepositoryRecord> {
    const selector = deriveCreatedSelector(plan.collection, values, returned);
    const record = await this.findOne({
      collection: plan.collection,
      fields: plan.fields,
      filter: uniqueFilter(selector),
    });
    if (!record) {
      throw new Error('Created Repository record could not be reloaded.');
    }
    return record;
  }

  private async findByUnique(
    collection: CollectionDefinition,
    unique: UniqueSelector,
  ): Promise<RepositoryRecord | undefined> {
    return this.findOne({
      collection,
      fields: scalarFields(collection).map((field) => field.name),
      filter: uniqueFilter(unique),
    });
  }

  private async inTransaction<TResult>(
    execute: (adapter: KnexRepositoryExecutionAdapter) => Promise<TResult>,
  ): Promise<TResult> {
    const client = this.getClient();
    if (isTransaction(client)) return execute(this);
    return client.transaction((transaction) =>
      execute(new KnexRepositoryExecutionAdapter(() => transaction)),
    );
  }
}

function tableQuery(
  client: Knex,
  collection: CollectionDefinition,
): Knex.QueryBuilder {
  const tableName = naming(collection).collectionToTableName(collection.name!);
  const query = client(tableName);
  return collection.db?.schema ? query.withSchema(collection.db.schema) : query;
}

function naming(collection: CollectionDefinition): DefaultNamingStrategy {
  return new DefaultNamingStrategy(collection.naming);
}

function column(collection: CollectionDefinition, field: string): string {
  return naming(collection).fieldToColumnName(field);
}

function scalarFields(collection: CollectionDefinition): FieldDefinition[] {
  return (collection.fields ?? []).filter(isScalarField);
}

function isScalarField(field: AnyFieldDefinition): field is FieldDefinition {
  return !('target' in field);
}

function mapWrite(
  collection: CollectionDefinition,
  values: RepositoryRecord,
): RepositoryRecord {
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => [
      column(collection, field),
      value,
    ]),
  );
}

function mapRow(
  collection: CollectionDefinition,
  fields: readonly string[],
  row: RepositoryRecord,
): RepositoryRecord {
  return Object.fromEntries(
    fields.map((field) => [
      field,
      Object.hasOwn(row, field) ? row[field] : row[column(collection, field)],
    ]),
  );
}

function applyFilter(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  root: FilterGroupNode | undefined,
): void {
  if (!root || root.items.length === 0) return;
  query.where(function applyRoot(): void {
    applyGroupItems(this, collection, root);
  });
}

function applyGroupItems(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  group: FilterGroupNode,
): void {
  group.items.forEach((node, index) => {
    applyNode(query, collection, node, index === 0 ? 'and' : group.logic);
  });
}

function applyNode(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  node: FilterNode,
  boolean: 'and' | 'or',
): void {
  const method = boolean === 'or' ? 'orWhere' : 'where';
  if (node.kind === 'group') {
    query[method](function applyNested(): void {
      applyGroupItems(this, collection, node);
    });
    return;
  }
  if (node.kind === 'relation') {
    throw new Error('Relation filters must be compiled before execution.');
  }
  applyCondition(query, collection, node, boolean);
}

function applyCondition(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  node: FilterConditionNode,
  boolean: 'and' | 'or',
): void {
  const name = column(collection, node.path[0]);
  switch (node.operator) {
    case '$eq':
      if (node.value === null) {
        query[boolean === 'or' ? 'orWhereNull' : 'whereNull'](name);
      } else {
        whereValue(query, boolean, name, '=', node.value);
      }
      return;
    case '$ne':
      if (node.value === null) {
        query[boolean === 'or' ? 'orWhereNotNull' : 'whereNotNull'](name);
      } else {
        whereValue(query, boolean, name, '!=', node.value);
      }
      return;
    case '$gt':
    case '$dateAfter':
      whereValue(query, boolean, name, '>', node.value);
      return;
    case '$gte':
    case '$dateNotBefore':
      whereValue(query, boolean, name, '>=', node.value);
      return;
    case '$lt':
    case '$dateBefore':
      whereValue(query, boolean, name, '<', node.value);
      return;
    case '$lte':
    case '$dateNotAfter':
      whereValue(query, boolean, name, '<=', node.value);
      return;
    case '$includes':
      whereValue(
        query,
        boolean,
        name,
        'like',
        `%${stringFilterValue(node.value)}%`,
      );
      return;
    case '$notIncludes':
      whereValue(
        query,
        boolean,
        name,
        'not like',
        `%${stringFilterValue(node.value)}%`,
      );
      return;
    case '$empty':
      if (isTextualField(collection, node.path[0])) {
        whereCallback(query, boolean, function emptyValue(): void {
          this.whereNull(name).orWhere(name, '');
        });
      } else {
        query[boolean === 'or' ? 'orWhereNull' : 'whereNull'](name);
      }
      return;
    case '$notEmpty':
      if (isTextualField(collection, node.path[0])) {
        whereCallback(query, boolean, function nonEmptyValue(): void {
          this.whereNotNull(name).andWhere(name, '!=', '');
        });
      } else {
        query[boolean === 'or' ? 'orWhereNotNull' : 'whereNotNull'](name);
      }
      return;
    case '$dateOn':
      whereValue(query, boolean, name, '=', node.value);
      return;
    case '$dateNotOn':
      whereValue(query, boolean, name, '!=', node.value);
      return;
    case '$dateBetween': {
      const [start, end] = node.value as readonly FilterValue[];
      whereCallback(query, boolean, function dateRange(): void {
        this.where(name, '>=', start as Knex.Value).andWhere(
          name,
          '<',
          end as Knex.Value,
        );
      });
      return;
    }
    case '$isTruly':
      whereValue(query, boolean, name, '=', true);
      return;
    case '$isFalsy':
      whereValue(query, boolean, name, '=', false);
      return;
  }
}

function applySort(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  item: SortItemNode,
): void {
  if (item.by.kind !== 'field') {
    throw new Error('Relation sorts must be compiled before execution.');
  }
  query.orderBy(column(collection, item.by.field), item.direction, item.nulls);
}

function applyUnique(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  unique: UniqueSelector,
): void {
  for (const field of unique.fields) {
    query.where(
      column(collection, field),
      '=',
      unique.values[field] as Knex.Value,
    );
  }
}

function whereValue(
  query: Knex.QueryBuilder,
  boolean: 'and' | 'or',
  name: string,
  operator: string,
  value: unknown,
): void {
  if (boolean === 'or') {
    query.orWhere(name, operator, value as Knex.Value);
  } else {
    query.where(name, operator, value as Knex.Value);
  }
}

function whereCallback(
  query: Knex.QueryBuilder,
  boolean: 'and' | 'or',
  callback: (this: Knex.QueryBuilder) => void,
): void {
  if (boolean === 'or') query.orWhere(callback);
  else query.where(callback);
}

function applyVersion(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  ifVersion: string | number | undefined,
): void {
  if (ifVersion !== undefined && collection.optimisticLock) {
    query.where(
      column(collection, collection.optimisticLock.field),
      '=',
      ifVersion,
    );
  }
}

function incrementVersion(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
): void {
  if (collection.optimisticLock) {
    query.increment(column(collection, collection.optimisticLock.field), 1);
  }
}

function withInitialVersion(
  collection: CollectionDefinition,
  values: RepositoryRecord,
): RepositoryRecord {
  return collection.optimisticLock
    ? { ...values, [collection.optimisticLock.field]: 1 }
    : values;
}

function versionOf(
  collection: CollectionDefinition,
  record: RepositoryRecord,
): string | number | undefined {
  if (!collection.optimisticLock) return undefined;
  return record[collection.optimisticLock.field] as string | number | undefined;
}

function firstReturnedRow(value: unknown): RepositoryRecord | undefined {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : undefined;
}

function deriveCreatedSelector(
  collection: CollectionDefinition,
  values: RepositoryRecord,
  returned: unknown,
): UniqueSelector {
  const constraints = (collection.constraints ?? []).filter(
    (constraint) =>
      constraint.type === 'primary' || constraint.type === 'unique',
  );
  for (const constraint of constraints) {
    const selectorValues: RepositoryRecord = {};
    let complete = true;
    for (const field of constraint.fields) {
      let value = values[field];
      if (value === undefined && constraint.type === 'primary') {
        value = Array.isArray(returned) ? returned[0] : undefined;
      }
      if (value === undefined || isRecord(value)) {
        complete = false;
        break;
      }
      selectorValues[field] = value;
    }
    if (complete) {
      return {
        kind: 'unique',
        fields: constraint.fields,
        values: selectorValues,
      };
    }
  }
  throw new Error(
    'Created Repository record has no reloadable unique selector.',
  );
}

function uniqueFilter(unique: UniqueSelector): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'and',
      items: unique.fields.map((field) => ({
        kind: 'condition',
        path: [field],
        operator: '$eq',
        value: unique.values[field] as FilterValue,
      })),
    },
  };
}

function affectedCount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) return value.length;
  return 0;
}

function insertedCount(value: unknown, fallback: number): number {
  void value;
  return fallback;
}

function isRecord(value: unknown): value is RepositoryRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTransaction(client: Knex): client is Knex.Transaction {
  return Boolean((client as Knex.Transaction).isTransaction);
}

function stringFilterValue(value: FilterValue | undefined): string {
  if (typeof value !== 'string') {
    throw new Error('String filter operator requires a string value.');
  }
  return value;
}

function isTextualField(
  collection: CollectionDefinition,
  field: string,
): boolean {
  const type = collection.fields?.find((item) => item.name === field)?.type;
  return type === 'string' || type === 'uuid' || type === 'text';
}
