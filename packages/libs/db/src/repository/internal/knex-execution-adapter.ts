import type { Knex } from 'knex';
import type {
  AnyFieldDefinition,
  CollectionDefinition,
  FieldDefinition,
  RelationFieldDefinition,
} from '../../collection/types.js';
import { DefaultNamingStrategy } from '../../naming/default-strategy.js';
import { RepositoryError } from '../errors.js';
import { isNumericMutation } from '../numeric-mutation.js';
import type {
  ConnectTarget,
  CreatedTargetReference,
  CreateTarget,
  FilterAst,
  FilterConditionNode,
  FilterGroupNode,
  FilterNode,
  FilterRelationNode,
  FilterValue,
  RepositoryRecord,
  RelationMutationAst,
  RelationMutationNode,
  RelationDeleteTarget,
  RelationUpdateTarget,
  RelationUpsertTarget,
  SelectNode,
  SelectIncludeNode,
  SelectAst,
  SortNode,
  UniqueSelector,
} from '../types.js';
import type {
  RepositoryCreateManyPlan,
  RepositoryCreateOnePlan,
  RepositoryDeleteManyPlan,
  RepositoryDeleteOnePlan,
  RepositoryDeletedMutation,
  RepositoryExecutedMutation,
  RepositoryExecutedManyMutation,
  RepositoryExecutionAdapter,
  RepositoryAggregatePlan,
  RepositoryCursorAxis,
  RepositoryGroupByPlan,
  RepositoryFilterPlan,
  RepositoryReadPlan,
  RepositorySingleMutationMiss,
  RepositoryUpdateManyPlan,
  RepositoryUpdateOnePlan,
  RepositoryUpsertOnePlan,
} from './execution-adapter.js';

interface LockedMutationRecord {
  readonly record: RepositoryRecord;
  readonly unique: UniqueSelector;
}

interface GroupByOutput {
  readonly name: string;
  readonly internal: string;
  readonly aggregate?: 'count' | 'sum' | 'avg' | 'min' | 'max';
}

export class KnexRepositoryExecutionAdapter implements RepositoryExecutionAdapter {
  constructor(
    private readonly getClient: () => Knex,
    private readonly getCollection: (
      name: string,
    ) => Promise<CollectionDefinition | undefined>,
  ) {}

  async findMany(plan: RepositoryReadPlan): Promise<RepositoryRecord[]> {
    const { query } = await this.buildRead(plan);
    const rows = (await query) as RepositoryRecord[];
    if (plan.select?.root.includes?.length) {
      await this.loadRelations(plan.collection, rows, plan.select.root);
    }
    return rows.map((row) => projectRow(row, plan.fields, plan.select?.root));
  }

  async *stream(plan: RepositoryReadPlan): AsyncIterable<RepositoryRecord> {
    if (plan.select?.root.includes?.length) {
      throw new Error('Repository stream does not support relation include.');
    }
    const { query } = await this.buildRead(plan);
    const source = query.stream() as AsyncIterable<RepositoryRecord> & {
      destroy(error?: Error): void;
    };
    try {
      for await (const row of source) {
        yield projectRow(row, plan.fields, plan.select?.root);
      }
    } finally {
      source.destroy();
    }
  }

  async findOne(
    plan: RepositoryReadPlan,
  ): Promise<RepositoryRecord | undefined> {
    return (await this.findMany({ ...plan, limit: 1 }))[0];
  }

  async count(plan: RepositoryFilterPlan): Promise<number> {
    const client = this.getClient();
    const alias = 'repository_root';
    const query = tableQuery(client, plan.collection, alias).count({
      count: '*',
    });
    const graph = await this.prepareFilterGraph(
      plan.collection,
      plan.filter?.root,
    );
    applyFilter(
      query,
      plan.collection,
      plan.filter?.root,
      graph,
      alias,
      client,
    );
    const row = (await query.first()) as
      { count?: string | number } | undefined;
    return Number(row?.count ?? 0);
  }

  async exists(plan: RepositoryFilterPlan): Promise<boolean> {
    const client = this.getClient();
    const alias = 'repository_root';
    const query = tableQuery(client, plan.collection, alias).select(
      client.raw('1 as value'),
    );
    const graph = await this.prepareFilterGraph(
      plan.collection,
      plan.filter?.root,
    );
    applyFilter(
      query,
      plan.collection,
      plan.filter?.root,
      graph,
      alias,
      client,
    );
    return (await query.first()) !== undefined;
  }

  async aggregate(plan: RepositoryAggregatePlan): Promise<RepositoryRecord> {
    const client = this.getClient();
    const alias = 'repository_root';
    const query = tableQuery(client, plan.collection, alias);
    const selections = plan.aggregate.items.map((item, index) => {
      const resultAlias = `aggregate_${index}`;
      const field =
        item.field !== undefined
          ? qualified(alias, column(plan.collection, item.field))
          : '*';
      if (item.kind === 'count') query.count({ [resultAlias]: field });
      if (item.kind === 'sum') query.sum({ [resultAlias]: field });
      if (item.kind === 'avg') query.avg({ [resultAlias]: field });
      if (item.kind === 'min') query.min({ [resultAlias]: field });
      if (item.kind === 'max') query.max({ [resultAlias]: field });
      return { item, resultAlias };
    });
    const graph = await this.prepareFilterGraph(
      plan.collection,
      plan.filter?.root,
    );
    applyFilter(
      query,
      plan.collection,
      plan.filter?.root,
      graph,
      alias,
      client,
    );
    const row = (await query.first()) as RepositoryRecord | undefined;
    return Object.fromEntries(
      selections.map(({ item, resultAlias }) => {
        const value = row?.[resultAlias];
        return [
          item.alias,
          item.kind === 'count' ? Number(value ?? 0) : (value ?? null),
        ];
      }),
    );
  }

  async groupBy(plan: RepositoryGroupByPlan): Promise<RepositoryRecord[]> {
    const client = this.getClient();
    const rootAlias = 'repository_root';
    const resultAlias = 'repository_group';
    const inner = tableQuery(client, plan.collection, rootAlias);
    const outputs: GroupByOutput[] = plan.by.map((field, index) => ({
      name: field,
      internal: `group_${index}`,
      aggregate: undefined,
    }));
    for (const output of outputs) {
      const field = qualified(rootAlias, column(plan.collection, output.name));
      inner.select(client.ref(field).as(output.internal)).groupBy(field);
    }
    for (const [index, item] of plan.aggregate.items.entries()) {
      const internal = `aggregate_${index}`;
      const field =
        item.field !== undefined
          ? qualified(rootAlias, column(plan.collection, item.field))
          : '*';
      if (item.kind === 'count') inner.count({ [internal]: field });
      if (item.kind === 'sum') inner.sum({ [internal]: field });
      if (item.kind === 'avg') inner.avg({ [internal]: field });
      if (item.kind === 'min') inner.min({ [internal]: field });
      if (item.kind === 'max') inner.max({ [internal]: field });
      outputs.push({ name: item.alias, internal, aggregate: item.kind });
    }
    const graph = await this.prepareFilterGraph(
      plan.collection,
      plan.filter?.root,
    );
    applyFilter(
      inner,
      plan.collection,
      plan.filter?.root,
      graph,
      rootAlias,
      client,
    );

    const query = client
      .queryBuilder()
      .from(inner.as(resultAlias))
      .select(
        outputs.map((output) =>
          client.ref(output.internal).withSchema(resultAlias),
        ),
      );
    const internalByName = new Map(
      outputs.map((output) => [output.name, output.internal]),
    );
    if (plan.having) {
      applyFilter(
        query,
        internalGroupResultCollection(plan, outputs),
        mapFilterFields(plan.having.root, internalByName),
        new WeakMap(),
        resultAlias,
        client,
      );
    }
    for (const item of plan.sort?.items ?? []) {
      if (item.kind !== 'field' || item.path.length !== 1) {
        throw new Error('GroupBy sort must target a direct result Field.');
      }
      const internal = internalByName.get(item.path[0]);
      if (!internal) throw new Error('GroupBy sort Field was not mapped.');
      applyOrderBy(
        query,
        client,
        qualified(resultAlias, internal),
        item.direction,
        item.nulls ?? 'last',
      );
    }
    const rows = (await query) as RepositoryRecord[];
    return rows.map((row) =>
      Object.fromEntries(
        outputs.map((output) => {
          const value = row[output.internal];
          return [
            output.name,
            output.aggregate === 'count'
              ? Number(value ?? 0)
              : output.aggregate
                ? (value ?? null)
                : value,
          ];
        }),
      ),
    );
  }

  async createOne(
    plan: RepositoryCreateOnePlan,
  ): Promise<RepositoryExecutedMutation> {
    return this.inTransaction((adapter) => adapter.executeCreateOne(plan));
  }

  private async executeCreateOne(
    plan: RepositoryCreateOnePlan,
  ): Promise<RepositoryExecutedMutation> {
    const createdTargets: CreatedTargetReference[] = [];
    const { record, unique } = await this.createRecord(
      plan.collection,
      plan.values,
      plan.relations,
      createdTargets,
    );
    const selected = await this.findOne({
      collection: plan.collection,
      fields: plan.fields,
      select: plan.select,
      filter: uniqueFilter(unique),
    });
    if (!selected)
      throw new Error('Created Repository record could not be reloaded.');
    return {
      record: selected,
      createdTargets,
      version: versionOf(plan.collection, record),
    };
  }

  async createMany(
    plan: RepositoryCreateManyPlan,
  ): Promise<RepositoryExecutedManyMutation> {
    if (plan.fields) {
      return this.inTransaction((adapter) =>
        adapter.executeCreateManyReturning(plan),
      );
    }
    const records = plan.records.map((record) =>
      mapWrite(plan.collection, withInitialVersion(plan.collection, record)),
    );
    const result = (await tableQuery(this.getClient(), plan.collection).insert(
      records,
    )) as unknown;
    return { count: insertedCount(result, records.length) };
  }

  private async executeCreateManyReturning(
    plan: RepositoryCreateManyPlan,
  ): Promise<RepositoryExecutedManyMutation> {
    const fields = plan.fields;
    if (!fields) throw new Error('Returning createMany requires fields.');
    const records: RepositoryRecord[] = [];
    for (const values of plan.records) {
      const result = await this.executeCreateOne({
        collection: plan.collection,
        fields,
        values,
        select: plan.select,
      });
      records.push(result.record);
    }
    return { count: records.length, records };
  }

  async updateOne(
    plan: RepositoryUpdateOnePlan,
  ): Promise<RepositoryExecutedMutation | RepositorySingleMutationMiss> {
    return this.inTransaction((adapter) => adapter.executeUpdateOne(plan));
  }

  private async executeUpdateOne(
    plan: RepositoryUpdateOnePlan,
  ): Promise<RepositoryExecutedMutation | RepositorySingleMutationMiss> {
    const selected = await this.lockByFilter(plan.collection, plan.filter);
    if (selected === 'missing' || selected === 'multiple') return selected;
    const { record: current, unique } = selected;
    if (
      plan.ifVersion !== undefined &&
      versionOf(plan.collection, current) !== plan.ifVersion
    ) {
      return 'conflict';
    }
    if (Object.keys(plan.values).length > 0) {
      const query = tableQuery(this.getClient(), plan.collection).update(
        mapUpdate(this.getClient(), plan.collection, plan.values),
      );
      applyUnique(query, plan.collection, unique);
      applyVersion(query, plan.collection, plan.ifVersion);
      if (affectedCount(await query) === 0) return 'conflict';
      Object.assign(
        current,
        await this.refreshAtomicValues(plan.collection, unique, plan.values),
      );
    }
    const createdTargets: CreatedTargetReference[] = [];
    if (plan.relations) {
      await this.applyRelationMutations(
        plan.collection,
        current,
        unique,
        plan.relations,
        createdTargets,
      );
    }
    if (plan.collection.optimisticLock) {
      const versionQuery = tableQuery(this.getClient(), plan.collection);
      applyUnique(versionQuery, plan.collection, unique);
      applyVersion(versionQuery, plan.collection, plan.ifVersion);
      incrementVersion(versionQuery, plan.collection);
      if (affectedCount(await versionQuery) === 0) return 'conflict';
    }
    const record = await this.findOne({
      collection: plan.collection,
      fields: plan.fields,
      select: plan.select,
      filter: uniqueFilter(unique),
    });
    return record
      ? {
          record,
          createdTargets,
          version: versionOf(plan.collection, record),
        }
      : 'missing';
  }

  async upsertOne(
    plan: RepositoryUpsertOnePlan,
  ): Promise<RepositoryExecutedMutation | 'conflict'> {
    return this.inTransaction((adapter) => adapter.executeUpsertOne(plan));
  }

  private async executeUpsertOne(
    plan: RepositoryUpsertOnePlan,
  ): Promise<RepositoryExecutedMutation | 'conflict'> {
    const selected = await this.lockByUnique(plan.collection, plan.by);
    if (selected === 'missing') {
      try {
        return await this.inSavepoint((adapter) =>
          adapter.executeCreateOne({
            collection: plan.collection,
            fields: plan.fields,
            values: plan.createValues,
            relations: plan.createRelations,
            select: plan.select,
          }),
        );
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        const concurrent = await this.lockByUnique(plan.collection, plan.by);
        if (concurrent === 'missing') throw error;
      }
    }
    const updated = await this.executeUpdateOne({
      collection: plan.collection,
      fields: plan.fields,
      filter: uniqueFilter(plan.by),
      values: plan.updateValues,
      ifVersion: plan.ifVersion,
      relations: plan.updateRelations,
      select: plan.select,
    });
    if (updated === 'conflict') return updated;
    if (updated === 'missing' || updated === 'multiple') {
      throw new Error('Upsert target disappeared while updating.');
    }
    return updated;
  }

  async updateMany(
    plan: RepositoryUpdateManyPlan,
  ): Promise<RepositoryExecutedManyMutation> {
    if (plan.fields) {
      return this.inTransaction((adapter) =>
        adapter.executeUpdateManyReturning(plan),
      );
    }
    const query = tableQuery(this.getClient(), plan.collection).update(
      mapUpdate(this.getClient(), plan.collection, plan.values),
    );
    if (plan.filter) {
      const graph = await this.prepareFilterGraph(
        plan.collection,
        plan.filter.root,
      );
      applyFilter(
        query,
        plan.collection,
        plan.filter.root,
        graph,
        tableName(plan.collection),
        this.getClient(),
      );
    }
    incrementVersion(query, plan.collection);
    return { count: affectedCount(await query) };
  }

  private async executeUpdateManyReturning(
    plan: RepositoryUpdateManyPlan,
  ): Promise<RepositoryExecutedManyMutation> {
    const fields = plan.fields;
    if (!fields) throw new Error('Returning updateMany requires fields.');
    const selected = await this.lockManyByFilter(plan.collection, plan.filter);
    if (selected.length === 0) return { count: 0, records: [] };
    const query = tableQuery(this.getClient(), plan.collection).update(
      mapUpdate(this.getClient(), plan.collection, plan.values),
    );
    applySelectors(
      query,
      plan.collection,
      selected.map((item) => item.unique),
    );
    incrementVersion(query, plan.collection);
    const count = affectedCount(await query);
    assertBulkMutationCount('updateMany', count, selected.length);
    const resultSelectors = selected.map((item) =>
      selectorFromFields(
        plan.collection,
        { ...item.record, ...plan.values },
        item.unique.fields,
      ),
    );
    const records = await this.findManyBySelectors(
      plan.collection,
      resultSelectors,
      fields,
      plan.select,
    );
    return { count, records };
  }

  async deleteOne(
    plan: RepositoryDeleteOnePlan,
  ): Promise<
    'deleted' | RepositoryDeletedMutation | RepositorySingleMutationMiss
  > {
    return this.inTransaction((adapter) => adapter.executeDeleteOne(plan));
  }

  private async executeDeleteOne(
    plan: RepositoryDeleteOnePlan,
  ): Promise<
    'deleted' | RepositoryDeletedMutation | RepositorySingleMutationMiss
  > {
    const selected = await this.lockByFilter(plan.collection, plan.filter);
    if (selected === 'missing' || selected === 'multiple') return selected;
    if (
      plan.ifVersion !== undefined &&
      versionOf(plan.collection, selected.record) !== plan.ifVersion
    ) {
      return 'conflict';
    }
    const snapshot = plan.fields
      ? await this.findOne({
          collection: plan.collection,
          fields: plan.fields,
          select: plan.select,
          filter: uniqueFilter(selected.unique),
        })
      : undefined;
    if (plan.fields && !snapshot) return 'missing';
    const query = tableQuery(this.getClient(), plan.collection).delete();
    applyUnique(query, plan.collection, selected.unique);
    applyVersion(query, plan.collection, plan.ifVersion);
    if (affectedCount(await query) > 0) {
      return snapshot ? { record: snapshot } : 'deleted';
    }
    return plan.ifVersion === undefined ? 'missing' : 'conflict';
  }

  async deleteMany(
    plan: RepositoryDeleteManyPlan,
  ): Promise<RepositoryExecutedManyMutation> {
    if (plan.fields) {
      return this.inTransaction((adapter) =>
        adapter.executeDeleteManyReturning(plan),
      );
    }
    const query = tableQuery(this.getClient(), plan.collection).delete();
    if (plan.filter) {
      const graph = await this.prepareFilterGraph(
        plan.collection,
        plan.filter.root,
      );
      applyFilter(
        query,
        plan.collection,
        plan.filter.root,
        graph,
        tableName(plan.collection),
        this.getClient(),
      );
    }
    return { count: affectedCount(await query) };
  }

  private async executeDeleteManyReturning(
    plan: RepositoryDeleteManyPlan,
  ): Promise<RepositoryExecutedManyMutation> {
    const fields = plan.fields;
    if (!fields) throw new Error('Returning deleteMany requires fields.');
    const selected = await this.lockManyByFilter(plan.collection, plan.filter);
    if (selected.length === 0) return { count: 0, records: [] };
    const selectors = selected.map((item) => item.unique);
    const records = await this.findManyBySelectors(
      plan.collection,
      selectors,
      fields,
      plan.select,
    );
    const query = tableQuery(this.getClient(), plan.collection).delete();
    applySelectors(query, plan.collection, selectors);
    const count = affectedCount(await query);
    assertBulkMutationCount('deleteMany', count, selected.length);
    return { count, records };
  }

  private async buildRead(
    plan: RepositoryReadPlan,
  ): Promise<{ readonly query: Knex.QueryBuilder }> {
    const client = this.getClient();
    const fields = await this.selectionFields(
      plan.collection,
      plan.fields,
      plan.select?.root,
    );
    const alias = 'repository_root';
    if (plan.distinct) {
      return this.buildDistinctRead(plan, fields, alias);
    }
    const query = tableQuery(client, plan.collection, alias).select(
      fields.map((field) =>
        client.ref(field.column).withSchema(alias).as(field.alias),
      ),
    );
    const graph = await this.prepareFilterGraph(
      plan.collection,
      plan.filter?.root,
    );
    applyFilter(
      query,
      plan.collection,
      plan.filter?.root,
      graph,
      alias,
      client,
    );
    applyCursor(query, plan.cursor, (field) =>
      qualified(alias, column(plan.collection, field)),
    );
    for (const item of plan.sort?.items ?? []) {
      await this.applySort(query, plan.collection, item, alias);
    }
    if (plan.limit !== undefined) query.limit(plan.limit);
    if (plan.offset !== undefined) query.offset(plan.offset);
    return { query };
  }

  private async buildDistinctRead(
    plan: RepositoryReadPlan,
    fields: readonly SelectionColumn[],
    rootAlias: string,
  ): Promise<{ readonly query: Knex.QueryBuilder }> {
    const distinct = plan.distinct;
    if (!distinct) throw new Error('Distinct read requires distinct Fields.');
    const sort = plan.sort?.items ?? [];
    if (sort.length === 0) throw new Error('Distinct read requires sort.');
    const client = this.getClient();
    const usedAliases = new Set(fields.map((field) => field.alias));
    const sortFields = sort.map((item, index) => {
      if (item.kind !== 'field' || item.path.length !== 1) {
        throw new Error('Distinct read requires direct Field sort.');
      }
      const alias = unusedInternalAlias(usedAliases, `_distinct_sort_${index}`);
      return {
        field: item.path[0],
        alias,
        column: qualified(rootAlias, column(plan.collection, item.path[0])),
        direction: item.direction,
        nulls: item.nulls ?? 'last',
      };
    });
    const rankAlias = unusedInternalAlias(usedAliases, '_distinct_rank');
    const partitionSql = distinct.map(() => '??').join(', ');
    const orderSql = sortFields
      .map(
        (field) =>
          `case when ?? is null then ${field.nulls === 'last' ? 1 : 0} else ${
            field.nulls === 'last' ? 0 : 1
          } end asc, ?? ${field.direction}`,
      )
      .join(', ');
    const rankBindings = [
      ...distinct.map((field) =>
        qualified(rootAlias, column(plan.collection, field)),
      ),
      ...sortFields.flatMap((field) => [field.column, field.column]),
      rankAlias,
    ];
    const inner = tableQuery(client, plan.collection, rootAlias).select([
      ...fields.map((field) =>
        client.ref(field.column).withSchema(rootAlias).as(field.alias),
      ),
      ...sortFields.map((field) => client.ref(field.column).as(field.alias)),
      client.raw(
        `row_number() over (partition by ${partitionSql} order by ${orderSql}) as ??`,
        rankBindings,
      ),
    ]);
    const graph = await this.prepareFilterGraph(
      plan.collection,
      plan.filter?.root,
    );
    applyFilter(
      inner,
      plan.collection,
      plan.filter?.root,
      graph,
      rootAlias,
      client,
    );

    const resultAlias = 'repository_distinct';
    const query = client
      .queryBuilder()
      .from(inner.as(resultAlias))
      .select(
        fields.map((field) =>
          client.ref(field.alias).withSchema(resultAlias).as(field.alias),
        ),
      )
      .where(qualified(resultAlias, rankAlias), 1);
    const sortAliasByField = new Map(
      sortFields.map((field) => [field.field, field.alias]),
    );
    applyCursor(query, plan.cursor, (field) => {
      const internal = sortAliasByField.get(field);
      if (!internal) throw new Error('Distinct cursor Field was not mapped.');
      return qualified(resultAlias, internal);
    });
    for (const field of sortFields) {
      applyOrderBy(
        query,
        client,
        qualified(resultAlias, field.alias),
        field.direction,
        field.nulls,
      );
    }
    if (plan.limit !== undefined) query.limit(plan.limit);
    if (plan.offset !== undefined) query.offset(plan.offset);
    return { query };
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

  private async lockByUnique(
    collection: CollectionDefinition,
    unique: UniqueSelector,
  ): Promise<LockedMutationRecord | 'missing'> {
    const fields = scalarFields(collection).map((field) => field.name);
    const query = tableQuery(this.getClient(), collection).select(
      fields.map((field) =>
        this.getClient().ref(column(collection, field)).as(field),
      ),
    );
    applyUnique(query, collection, unique);
    query.forUpdate();
    const rows = (await query) as RepositoryRecord[];
    return rows[0] ? { record: rows[0], unique } : 'missing';
  }

  private async lockByFilter(
    collection: CollectionDefinition,
    filter: FilterAst,
  ): Promise<LockedMutationRecord | 'missing' | 'multiple'> {
    const client = this.getClient();
    const alias = 'repository_root';
    const fields = scalarFields(collection).map((field) => field.name);
    const query = tableQuery(client, collection, alias).select(
      fields.map((field) =>
        client.ref(column(collection, field)).withSchema(alias).as(field),
      ),
    );
    const graph = await this.prepareFilterGraph(collection, filter.root);
    applyFilter(query, collection, filter.root, graph, alias, client);
    query.limit(2).forUpdate();
    const rows = (await query) as RepositoryRecord[];
    if (rows.length === 0) return 'missing';
    if (rows.length > 1) return 'multiple';
    return {
      record: rows[0],
      unique: selectorFromRecord(collection, rows[0]),
    };
  }

  private async lockManyByFilter(
    collection: CollectionDefinition,
    filter: FilterAst | undefined,
  ): Promise<LockedMutationRecord[]> {
    const client = this.getClient();
    const alias = 'repository_root';
    const fields = scalarFields(collection).map((field) => field.name);
    const query = tableQuery(client, collection, alias).select(
      fields.map((field) =>
        client.ref(column(collection, field)).withSchema(alias).as(field),
      ),
    );
    if (filter) {
      const graph = await this.prepareFilterGraph(collection, filter.root);
      applyFilter(query, collection, filter.root, graph, alias, client);
    }
    for (const field of stableIdentityFields(collection)) {
      query.orderBy(column(collection, field), 'asc');
    }
    query.forUpdate();
    const rows = (await query) as RepositoryRecord[];
    return rows.map((record) => ({
      record,
      unique: selectorFromFields(
        collection,
        record,
        stableIdentityFields(collection),
      ),
    }));
  }

  private async findManyBySelectors(
    collection: CollectionDefinition,
    selectors: readonly UniqueSelector[],
    fields: readonly string[],
    select: SelectAst | undefined,
  ): Promise<RepositoryRecord[]> {
    if (selectors.length === 0) return [];
    const records = await this.findMany({
      collection,
      fields,
      select,
      filter: selectorsFilter(selectors),
      sort: {
        kind: 'sort',
        version: 1,
        items: stableIdentityFields(collection).map((field) => ({
          kind: 'field',
          path: [field],
          direction: 'asc',
        })),
      },
    });
    const identityFields = selectors[0]?.fields;
    if (!identityFields) return [];
    const recordsBySelector = new Map(
      records.map((record) => [
        selectorKey(selectorFromFields(collection, record, identityFields)),
        record,
      ]),
    );
    const ordered = selectors.map((selector) =>
      recordsBySelector.get(selectorKey(selector)),
    );
    if (ordered.some((record) => record === undefined)) {
      throw new Error('Bulk mutation record could not be reloaded.');
    }
    return ordered as RepositoryRecord[];
  }

  private async createRecord(
    collection: CollectionDefinition,
    input: RepositoryRecord,
    relations: RelationMutationAst | undefined,
    createdTargets: CreatedTargetReference[],
    clientKey?: string,
    additionalPhysicalValues: RepositoryRecord = {},
  ): Promise<{ record: RepositoryRecord; unique: UniqueSelector }> {
    const values = withInitialVersion(collection, input);
    const physicalValues = {
      ...mapWrite(collection, values),
      ...additionalPhysicalValues,
    };
    const deferred: RelationMutationNode[] = [];
    for (const node of relations?.items ?? []) {
      const resolved = await this.resolveRelation(collection, node.field);
      if (resolved.relation.type === 'belongsTo' && node.action === 'set') {
        const target = await this.resolveMutationTarget(
          resolved.target,
          node.target,
          createdTargets,
        );
        physicalValues[resolved.sourceColumn] =
          target.record[resolved.targetKey];
      } else {
        deferred.push(node);
      }
    }
    const record = await this.insertRecord(collection, values, physicalValues);
    const unique = selectorFromRecord(collection, record);
    if (clientKey) {
      createdTargets.push({ clientKey, collection: collection.name!, unique });
    }
    if (deferred.length > 0) {
      await this.applyRelationMutations(
        collection,
        record,
        unique,
        {
          kind: 'relationMutation',
          version: 1,
          collection: collection.name,
          items: deferred,
        },
        createdTargets,
      );
    }
    return { record, unique };
  }

  private async insertRecord(
    collection: CollectionDefinition,
    values: RepositoryRecord,
    physicalValues: RepositoryRecord = mapWrite(
      collection,
      withInitialVersion(collection, values),
    ),
  ): Promise<RepositoryRecord> {
    const fields = scalarFields(collection).map((field) => field.name);
    const query = tableQuery(this.getClient(), collection).insert(
      physicalValues,
    );
    const returned = (await query.returning(
      fields.map((field) => column(collection, field)),
    )) as unknown;
    const returnedRow = firstReturnedRow(returned);
    if (returnedRow) return mapRow(collection, fields, returnedRow);
    const selector = deriveCreatedSelector(collection, values, returned);
    const record = await this.findOne({
      collection,
      fields,
      filter: uniqueFilter(selector),
    });
    if (!record)
      throw new Error('Created Repository record could not be reloaded.');
    return record;
  }

  private async applyRelationMutations(
    collection: CollectionDefinition,
    source: RepositoryRecord,
    sourceUnique: UniqueSelector,
    mutations: RelationMutationAst,
    createdTargets: CreatedTargetReference[],
  ): Promise<void> {
    for (const node of mutations.items) {
      const resolved = await this.resolveRelation(collection, node.field);
      await this.applyRelationMutation(
        resolved,
        source,
        sourceUnique,
        node,
        createdTargets,
      );
    }
  }

  private async applyRelationMutation(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    sourceUnique: UniqueSelector,
    node: RelationMutationNode,
    createdTargets: CreatedTargetReference[],
  ): Promise<void> {
    if (node.action === 'set') {
      const target = await this.resolveMutationTarget(
        resolved.target,
        node.target,
        createdTargets,
        resolved,
        source,
      );
      await this.connectRelation(resolved, source, sourceUnique, target.record);
      return;
    }
    if (node.action === 'clear') {
      await this.clearRelation(resolved, source, sourceUnique);
      return;
    }
    if (node.action === 'modify') {
      if (node.update) {
        await this.updateRelatedTarget(
          resolved,
          source,
          node.update,
          createdTargets,
        );
      } else if (node.upsert) {
        await this.upsertRelatedTarget(
          resolved,
          source,
          sourceUnique,
          node.upsert,
          createdTargets,
        );
      } else if (node.delete) {
        await this.deleteRelatedTarget(
          resolved,
          source,
          sourceUnique,
          node.delete,
        );
      }
      return;
    }
    const connect =
      node.action === 'patch' ? (node.connect ?? []) : node.targets;
    const create = node.action === 'patch' ? (node.create ?? []) : [];
    const desired: Array<{
      record: RepositoryRecord;
      unique: UniqueSelector;
    }> = [];
    for (const target of [...connect, ...create]) {
      desired.push(
        await this.resolveMutationTarget(
          resolved.target,
          target,
          createdTargets,
          resolved,
          source,
        ),
      );
    }
    if (node.action === 'replace') {
      await this.replaceRelation(
        resolved,
        source,
        sourceUnique,
        desired.map((target) => target.record),
      );
      return;
    }
    for (const target of desired) {
      await this.connectRelation(resolved, source, sourceUnique, target.record);
    }
    for (const selector of node.disconnect ?? []) {
      const target = await this.findTarget(resolved.target, selector);
      await this.disconnectRelation(resolved, source, sourceUnique, target);
    }
    for (const target of node.update ?? []) {
      await this.updateRelatedTarget(resolved, source, target, createdTargets);
    }
    for (const target of node.upsert ?? []) {
      await this.upsertRelatedTarget(
        resolved,
        source,
        sourceUnique,
        target,
        createdTargets,
      );
    }
    for (const target of node.delete ?? []) {
      await this.deleteRelatedTarget(resolved, source, sourceUnique, target);
    }
  }

  private async updateRelatedTarget(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    target: RelationUpdateTarget,
    createdTargets: CreatedTargetReference[],
  ): Promise<void> {
    const selected = await this.lockRelatedTarget(
      resolved,
      source,
      target.filter,
    );
    if (selected === 'missing') relationTargetNotFound(resolved);
    if (selected === 'multiple') multipleRelationTargetsMatched(resolved);
    await this.updateTargetRecord(
      resolved.target,
      selected,
      target,
      createdTargets,
    );
  }

  private async upsertRelatedTarget(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    sourceUnique: UniqueSelector,
    target: RelationUpsertTarget,
    createdTargets: CreatedTargetReference[],
  ): Promise<void> {
    const selected = await this.lockRelatedTarget(
      resolved,
      source,
      target.filter,
    );
    if (selected === 'multiple') multipleRelationTargetsMatched(resolved);
    if (selected !== 'missing') {
      await this.updateTargetRecord(
        resolved.target,
        selected,
        target.update,
        createdTargets,
      );
      return;
    }
    if (
      target.by &&
      (await this.lockByUnique(resolved.target, target.by)) !== 'missing'
    ) {
      throw new RepositoryError(
        'RELATION_UPSERT_TARGET_OUTSIDE_SCOPE',
        'Relation upsert target exists outside the current relation scope.',
        {
          collection: resolved.source.name,
          relation: resolved.relation.name,
        },
      );
    }
    const created = await this.resolveMutationTarget(
      resolved.target,
      target.create,
      createdTargets,
      resolved,
      source,
    );
    await this.connectRelation(resolved, source, sourceUnique, created.record);
  }

  private async deleteRelatedTarget(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    sourceUnique: UniqueSelector,
    target: RelationDeleteTarget,
  ): Promise<void> {
    const selected = await this.lockRelatedTarget(
      resolved,
      source,
      target.filter,
    );
    if (selected === 'missing') relationTargetNotFound(resolved);
    if (selected === 'multiple') multipleRelationTargetsMatched(resolved);
    await this.removeTargetEdgesForDelete(
      resolved,
      sourceUnique,
      selected.record,
    );
    const query = tableQuery(this.getClient(), resolved.target).delete();
    applyUnique(query, resolved.target, selected.unique);
    if (affectedCount(await query) === 0) relationTargetNotFound(resolved);
  }

  private async removeTargetEdgesForDelete(
    resolved: ResolvedRepositoryRelation,
    sourceUnique: UniqueSelector,
    target: RepositoryRecord,
  ): Promise<void> {
    if (resolved.relation.type === 'belongsTo') {
      if (resolved.relation.nullable === false) {
        relationActionNotAllowed(resolved, 'delete');
      }
      const query = tableQuery(this.getClient(), resolved.source).update({
        [resolved.sourceColumn]: null,
      });
      applyUnique(query, resolved.source, sourceUnique);
      await query;
      return;
    }
    if (resolved.relation.type === 'belongsToMany') {
      await tableQuery(this.getClient(), resolved.through!)
        .where(
          column(resolved.through!, resolved.throughTargetForeignKey!),
          target[resolved.targetKey] as Knex.Value,
        )
        .delete();
    }
  }

  private async updateTargetRecord(
    collection: CollectionDefinition,
    selected: LockedMutationRecord,
    target: RelationUpdateTarget,
    createdTargets: CreatedTargetReference[],
  ): Promise<void> {
    if (Object.keys(target.values).length > 0) {
      const query = tableQuery(this.getClient(), collection).update(
        mapUpdate(
          this.getClient(),
          collection,
          target.values as RepositoryRecord,
        ),
      );
      applyUnique(query, collection, selected.unique);
      if (affectedCount(await query) === 0) {
        throw new RepositoryError(
          'RELATION_TARGET_NOT_FOUND',
          'Relation target was not found while updating.',
          { collection: collection.name },
        );
      }
      Object.assign(
        selected.record,
        await this.refreshAtomicValues(
          collection,
          selected.unique,
          target.values as RepositoryRecord,
        ),
      );
    }
    if (target.relations) {
      await this.applyRelationMutations(
        collection,
        selected.record,
        selected.unique,
        target.relations,
        createdTargets,
      );
    }
    if (collection.optimisticLock) {
      const versionQuery = tableQuery(this.getClient(), collection);
      applyUnique(versionQuery, collection, selected.unique);
      incrementVersion(versionQuery, collection);
      await versionQuery;
    }
  }

  private async refreshAtomicValues(
    collection: CollectionDefinition,
    unique: UniqueSelector,
    values: RepositoryRecord,
  ): Promise<RepositoryRecord> {
    if (!Object.values(values).some(isNumericMutation)) return values;
    const record = await this.findOne({
      collection,
      fields: scalarFields(collection).map((field) => field.name),
      filter: uniqueFilter(unique),
    });
    if (!record) throw new Error('Atomic update target disappeared.');
    return record;
  }

  private async lockRelatedTarget(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    filter: FilterAst | undefined,
  ): Promise<LockedMutationRecord | 'missing' | 'multiple'> {
    const client = this.getClient();
    const targetAlias = 'repository_relation_target';
    const fields = scalarFields(resolved.target).map((field) => field.name);
    const query = tableQuery(client, resolved.target, targetAlias).select(
      fields.map((field) =>
        client
          .ref(column(resolved.target, field))
          .withSchema(targetAlias)
          .as(field),
      ),
    );
    if (resolved.relation.type === 'belongsTo') {
      const sourceQuery = tableQuery(client, resolved.source).select(
        resolved.sourceColumn,
      );
      applyUnique(
        sourceQuery,
        resolved.source,
        selectorFromRecord(resolved.source, source),
      );
      query.whereIn(
        qualified(targetAlias, column(resolved.target, resolved.targetKey)),
        sourceQuery,
      );
    } else if (
      resolved.relation.type === 'hasOne' ||
      resolved.relation.type === 'hasMany'
    ) {
      query.where(
        qualified(
          targetAlias,
          column(resolved.target, resolved.targetForeignKey!),
        ),
        source[resolved.sourceKey] as Knex.Value,
      );
    } else {
      const throughAlias = 'repository_relation_through';
      query
        .join(
          collectionReference(client, resolved.through!, throughAlias),
          qualified(targetAlias, column(resolved.target, resolved.targetKey)),
          qualified(
            throughAlias,
            column(resolved.through!, resolved.throughTargetForeignKey!),
          ),
        )
        .where(
          qualified(
            throughAlias,
            column(resolved.through!, resolved.throughSourceForeignKey!),
          ),
          source[resolved.sourceKey] as Knex.Value,
        );
    }
    const graph = await this.prepareFilterGraph(resolved.target, filter?.root);
    applyFilter(
      query,
      resolved.target,
      filter?.root,
      graph,
      targetAlias,
      client,
    );
    query.limit(2).forUpdate();
    const rows = (await query) as RepositoryRecord[];
    if (rows.length === 0) return 'missing';
    if (rows.length > 1) return 'multiple';
    return {
      record: rows[0],
      unique: selectorFromRecord(resolved.target, rows[0]),
    };
  }

  private async resolveMutationTarget(
    collection: CollectionDefinition,
    target: ConnectTarget | CreateTarget,
    createdTargets: CreatedTargetReference[],
    resolved?: ResolvedRepositoryRelation,
    source?: RepositoryRecord,
  ): Promise<{ record: RepositoryRecord; unique: UniqueSelector }> {
    if (target.kind === 'create') {
      const additionalPhysicalValues: RepositoryRecord = {};
      if (
        source &&
        resolved &&
        (resolved.relation.type === 'hasOne' ||
          resolved.relation.type === 'hasMany')
      ) {
        additionalPhysicalValues[
          column(collection, resolved.targetForeignKey!)
        ] = source[resolved.sourceKey];
      }
      return this.createRecord(
        collection,
        target.values as RepositoryRecord,
        target.relations,
        createdTargets,
        target.clientKey,
        additionalPhysicalValues,
      );
    }
    return {
      record: await this.findTarget(collection, target.by),
      unique: target.by,
    };
  }

  private async findTarget(
    collection: CollectionDefinition,
    unique: UniqueSelector,
  ): Promise<RepositoryRecord> {
    const target = await this.findByUnique(collection, unique);
    if (!target) {
      throw new RepositoryError(
        'RECORD_NOT_FOUND',
        'Relation target was not found.',
        {
          collection: collection.name,
        },
      );
    }
    return target;
  }

  private async connectRelation(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    sourceUnique: UniqueSelector,
    target: RepositoryRecord,
  ): Promise<void> {
    if (resolved.relation.type === 'belongsTo') {
      const query = tableQuery(this.getClient(), resolved.source).update({
        [resolved.sourceColumn]: target[resolved.targetKey],
      });
      applyUnique(query, resolved.source, sourceUnique);
      await query;
      return;
    }
    if (
      resolved.relation.type === 'hasOne' ||
      resolved.relation.type === 'hasMany'
    ) {
      const sourceValue = source[resolved.sourceKey];
      const current = target[resolved.targetForeignKey!];
      if (
        current !== null &&
        current !== undefined &&
        associationKey(current) !== associationKey(sourceValue)
      ) {
        throw new RepositoryError(
          'RELATION_REASSIGNMENT_REQUIRED',
          'Relation target already belongs to another source record.',
          {
            collection: resolved.source.name,
            relation: resolved.relation.name,
          },
        );
      }
      if (resolved.relation.type === 'hasOne') {
        const existing = tableQuery(this.getClient(), resolved.target)
          .where(
            column(resolved.target, resolved.targetForeignKey!),
            sourceValue as Knex.Value,
          )
          .whereNot(
            column(resolved.target, resolved.targetKey),
            target[resolved.targetKey] as Knex.Value,
          );
        if (await existing.clone().first()) {
          if (!relationForeignKeyNullable(resolved)) {
            relationActionNotAllowed(resolved, 'set');
          }
          await existing.update({
            [column(resolved.target, resolved.targetForeignKey!)]: null,
          });
        }
      }
      await tableQuery(this.getClient(), resolved.target)
        .where(
          column(resolved.target, resolved.targetKey),
          target[resolved.targetKey] as Knex.Value,
        )
        .update({
          [column(resolved.target, resolved.targetForeignKey!)]: sourceValue,
        });
      return;
    }
    const edge = {
      [column(resolved.through!, resolved.throughSourceForeignKey!)]:
        source[resolved.sourceKey],
      [column(resolved.through!, resolved.throughTargetForeignKey!)]:
        target[resolved.targetKey],
    };
    const exists = await tableQuery(this.getClient(), resolved.through!)
      .where(edge)
      .first();
    if (!exists)
      await tableQuery(this.getClient(), resolved.through!).insert(edge);
  }

  private async clearRelation(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    sourceUnique: UniqueSelector,
  ): Promise<void> {
    if (resolved.relation.type === 'belongsTo') {
      if (resolved.relation.nullable === false)
        relationActionNotAllowed(resolved, 'clear');
      const query = tableQuery(this.getClient(), resolved.source).update({
        [resolved.sourceColumn]: null,
      });
      applyUnique(query, resolved.source, sourceUnique);
      await query;
      return;
    }
    if (resolved.relation.type !== 'hasOne')
      relationActionNotAllowed(resolved, 'clear');
    if (!relationForeignKeyNullable(resolved))
      relationActionNotAllowed(resolved, 'clear');
    await tableQuery(this.getClient(), resolved.target)
      .where(
        column(resolved.target, resolved.targetForeignKey!),
        source[resolved.sourceKey] as Knex.Value,
      )
      .update({ [column(resolved.target, resolved.targetForeignKey!)]: null });
  }

  private async disconnectRelation(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    _sourceUnique: UniqueSelector,
    target: RepositoryRecord,
  ): Promise<void> {
    if (resolved.relation.type === 'belongsToMany') {
      await tableQuery(this.getClient(), resolved.through!)
        .where(
          column(resolved.through!, resolved.throughSourceForeignKey!),
          source[resolved.sourceKey] as Knex.Value,
        )
        .where(
          column(resolved.through!, resolved.throughTargetForeignKey!),
          target[resolved.targetKey] as Knex.Value,
        )
        .delete();
      return;
    }
    if (
      resolved.relation.type !== 'hasMany' ||
      !relationForeignKeyNullable(resolved)
    ) {
      relationActionNotAllowed(resolved, 'patch');
    }
    await tableQuery(this.getClient(), resolved.target)
      .where(
        column(resolved.target, resolved.targetKey),
        target[resolved.targetKey] as Knex.Value,
      )
      .where(
        column(resolved.target, resolved.targetForeignKey!),
        source[resolved.sourceKey] as Knex.Value,
      )
      .update({ [column(resolved.target, resolved.targetForeignKey!)]: null });
  }

  private async replaceRelation(
    resolved: ResolvedRepositoryRelation,
    source: RepositoryRecord,
    sourceUnique: UniqueSelector,
    desired: readonly RepositoryRecord[],
  ): Promise<void> {
    const desiredValues = new Map(
      desired.map((target) => [
        associationKey(target[resolved.targetKey]),
        target[resolved.targetKey],
      ]),
    );
    if (resolved.relation.type === 'belongsToMany') {
      const current = (await tableQuery(this.getClient(), resolved.through!)
        .select(
          this.getClient()
            .ref(column(resolved.through!, resolved.throughTargetForeignKey!))
            .as('target'),
        )
        .where(
          column(resolved.through!, resolved.throughSourceForeignKey!),
          source[resolved.sourceKey] as Knex.Value,
        )) as Array<{ target: unknown }>;
      for (const edge of current) {
        if (!desiredValues.has(associationKey(edge.target))) {
          await tableQuery(this.getClient(), resolved.through!)
            .where(
              column(resolved.through!, resolved.throughSourceForeignKey!),
              source[resolved.sourceKey] as Knex.Value,
            )
            .where(
              column(resolved.through!, resolved.throughTargetForeignKey!),
              edge.target as Knex.Value,
            )
            .delete();
        }
      }
    } else {
      if (!relationForeignKeyNullable(resolved)) {
        const current = await tableQuery(this.getClient(), resolved.target)
          .where(
            column(resolved.target, resolved.targetForeignKey!),
            source[resolved.sourceKey] as Knex.Value,
          )
          .whereNotIn(column(resolved.target, resolved.targetKey), [
            ...desiredValues.values(),
          ] as Knex.Value[])
          .first();
        if (current) relationActionNotAllowed(resolved, 'replace');
      } else {
        let query = tableQuery(this.getClient(), resolved.target).where(
          column(resolved.target, resolved.targetForeignKey!),
          source[resolved.sourceKey] as Knex.Value,
        );
        if (desiredValues.size > 0) {
          query = query.whereNotIn(
            column(resolved.target, resolved.targetKey),
            [...desiredValues.values()] as Knex.Value[],
          );
        }
        await query.update({
          [column(resolved.target, resolved.targetForeignKey!)]: null,
        });
      }
    }
    for (const target of desired) {
      await this.connectRelation(resolved, source, sourceUnique, target);
    }
  }

  private async inTransaction<TResult>(
    execute: (adapter: KnexRepositoryExecutionAdapter) => Promise<TResult>,
  ): Promise<TResult> {
    const client = this.getClient();
    if (isTransaction(client)) return execute(this);
    return client.transaction((transaction) =>
      execute(
        new KnexRepositoryExecutionAdapter(
          () => transaction,
          this.getCollection,
        ),
      ),
    );
  }

  private async inSavepoint<TResult>(
    execute: (adapter: KnexRepositoryExecutionAdapter) => Promise<TResult>,
  ): Promise<TResult> {
    return this.getClient().transaction((transaction) =>
      execute(
        new KnexRepositoryExecutionAdapter(
          () => transaction,
          this.getCollection,
        ),
      ),
    );
  }

  private async selectionFields(
    collection: CollectionDefinition,
    fields: readonly string[],
    select: SelectNode | undefined,
  ): Promise<SelectionColumn[]> {
    const selected = fields.map((field) => ({
      column: column(collection, field),
      alias: field,
    }));
    for (const node of select?.includes ?? []) {
      const resolved = await this.resolveRelation(collection, node.relation);
      selected.push({
        column: resolved.sourceColumn,
        alias: relationHelper(node.relation),
      });
    }
    return uniqueSelectionColumns(selected);
  }

  private async loadRelations(
    collection: CollectionDefinition,
    rows: RepositoryRecord[],
    select: SelectNode,
  ): Promise<void> {
    if (rows.length === 0) return;
    for (const node of select.includes ?? []) {
      await this.loadRelation(collection, rows, node);
    }
  }

  private async loadRelation(
    collection: CollectionDefinition,
    parents: RepositoryRecord[],
    node: SelectIncludeNode,
  ): Promise<void> {
    const resolved = await this.resolveRelation(collection, node.relation);
    const parentValues = uniqueValues(
      parents.map((parent) => parent[relationHelper(node.relation)]),
    );
    if (parentValues.length === 0) {
      for (const parent of parents)
        parent[node.relation] = emptyRelation(resolved);
      return;
    }

    const targetAlias = 'repository_target';
    const requested =
      node.select.fields ??
      scalarFields(resolved.target).map((field) => field.name);
    const selected = requested.map((field) => ({
      column: column(resolved.target, field),
      alias: field,
    }));
    const associationField =
      resolved.relation.type === 'belongsTo'
        ? resolved.targetKey
        : resolved.relation.type === 'hasOne' ||
            resolved.relation.type === 'hasMany'
          ? resolved.targetForeignKey
          : undefined;
    if (associationField) {
      selected.push({
        column: column(resolved.target, associationField),
        alias: relationParentHelper(node.relation),
      });
    }
    for (const child of node.select.includes ?? []) {
      const childRelation = await this.resolveRelation(
        resolved.target,
        child.relation,
      );
      selected.push({
        column: childRelation.sourceColumn,
        alias: relationHelper(child.relation),
      });
    }

    const client = this.getClient();
    const query = tableQuery(client, resolved.target, targetAlias).select(
      uniqueSelectionColumns(selected).map((field) =>
        client.ref(field.column).withSchema(targetAlias).as(field.alias),
      ),
    );
    if (resolved.relation.type === 'belongsTo') {
      query.whereIn(
        qualified(targetAlias, column(resolved.target, resolved.targetKey)),
        parentValues as Knex.Value[],
      );
    } else if (
      resolved.relation.type === 'hasOne' ||
      resolved.relation.type === 'hasMany'
    ) {
      query.whereIn(
        qualified(
          targetAlias,
          column(resolved.target, resolved.targetForeignKey!),
        ),
        parentValues as Knex.Value[],
      );
    } else {
      const throughAlias = 'repository_through';
      query
        .join(
          collectionReference(client, resolved.through!, throughAlias),
          qualified(targetAlias, column(resolved.target, resolved.targetKey)),
          qualified(
            throughAlias,
            column(resolved.through!, resolved.throughTargetForeignKey!),
          ),
        )
        .whereIn(
          qualified(
            throughAlias,
            column(resolved.through!, resolved.throughSourceForeignKey!),
          ),
          parentValues as Knex.Value[],
        )
        .select(
          client
            .ref(column(resolved.through!, resolved.throughSourceForeignKey!))
            .withSchema(throughAlias)
            .as(relationParentHelper(node.relation)),
        );
    }

    const graph = await this.prepareFilterGraph(
      resolved.target,
      node.filter?.root,
    );
    applyFilter(
      query,
      resolved.target,
      node.filter?.root,
      graph,
      targetAlias,
      client,
    );
    applyCursor(query, relationCursorAxes(node), (field) =>
      qualified(targetAlias, column(resolved.target, field)),
    );
    for (const item of node.sort?.items ?? []) {
      await this.applySort(query, resolved.target, item, targetAlias);
    }
    const targets = (await query) as RepositoryRecord[];
    const grouped = new Map<string, RepositoryRecord[]>();
    for (const target of targets) {
      const key = associationKey(target[relationParentHelper(node.relation)]);
      const group = grouped.get(key) ?? [];
      group.push(target);
      grouped.set(key, group);
    }
    const selectedTargets = [...grouped.values()].flatMap((group) =>
      node.limit === undefined ? group : group.slice(0, node.limit),
    );
    if (node.select.includes?.length) {
      await this.loadRelations(resolved.target, selectedTargets, node.select);
    }
    for (const parent of parents) {
      const group =
        grouped.get(associationKey(parent[relationHelper(node.relation)])) ??
        [];
      const matches = (
        node.limit === undefined ? group : group.slice(0, node.limit)
      ).map((target) => projectRow(target, requested, node.select));
      parent[node.relation] = isToOne(resolved.relation)
        ? (matches[0] ?? null)
        : matches;
    }
  }

  private async prepareFilterGraph(
    collection: CollectionDefinition,
    root: FilterGroupNode | undefined,
  ): Promise<RelationGraph> {
    const graph: RelationGraph = new WeakMap();
    const visit = async (
      current: CollectionDefinition,
      node: FilterNode,
    ): Promise<void> => {
      if (node.kind === 'group') {
        await Promise.all(node.items.map((item) => visit(current, item)));
      } else if (node.kind === 'relation') {
        const resolved = await this.resolveRelation(current, node.path[0]);
        graph.set(node, resolved);
        if (node.filter) await visit(resolved.target, node.filter);
      }
    };
    if (root) await visit(collection, root);
    return graph;
  }

  private async applySort(
    query: Knex.QueryBuilder,
    collection: CollectionDefinition,
    item: SortNode,
    sourceAlias: string,
  ): Promise<void> {
    const client = this.getClient();
    if (item.kind === 'field' && item.path.length === 1) {
      applyOrderBy(
        query,
        client,
        qualified(sourceAlias, column(collection, item.path[0])),
        item.direction,
        item.nulls ?? 'last',
      );
      return;
    }
    const relationPath =
      item.kind === 'field' ? item.path.slice(0, -1) : item.relation;
    const path = await this.resolveRelationPath(collection, relationPath);
    const value = relationSortSubquery(
      client,
      path,
      sourceAlias,
      item.kind === 'field'
        ? { kind: 'field', field: item.path[item.path.length - 1] }
        : {
            kind: 'aggregate',
            aggregate: item.aggregate,
            field: item.field,
          },
    );
    applyOrderBy(query, client, value, item.direction, item.nulls ?? 'last');
  }

  private async resolveRelationPath(
    collection: CollectionDefinition,
    path: readonly string[],
  ): Promise<ResolvedRepositoryRelation[]> {
    const result: ResolvedRepositoryRelation[] = [];
    let current = collection;
    for (const field of path) {
      const relation = await this.resolveRelation(current, field);
      result.push(relation);
      current = relation.target;
    }
    return result;
  }

  private async resolveRelation(
    source: CollectionDefinition,
    field: string,
  ): Promise<ResolvedRepositoryRelation> {
    const relation = relationFields(source).find((item) => item.name === field);
    if (!relation) {
      throw new RepositoryError(
        'RELATION_NOT_FOUND',
        `Relation "${source.name}.${field}" does not exist.`,
        { collection: source.name, relation: field },
      );
    }
    const target = await this.getCollection(relation.target);
    if (!target) {
      throw new RepositoryError(
        'COLLECTION_NOT_FOUND',
        `Relation target "${relation.target}" does not exist.`,
        { collection: relation.target, relation: relation.name },
      );
    }
    const sourceKey = relation.sourceKey ?? 'id';
    const targetKey = relation.targetKey ?? 'id';
    if (relation.type === 'belongsTo') {
      return {
        source,
        relation,
        target,
        sourceKey,
        targetKey,
        sourceColumn: relation.foreignKey
          ? column(source, relation.foreignKey)
          : naming(source).relationForeignKey(relation.name),
      };
    }
    if (relation.type === 'hasOne' || relation.type === 'hasMany') {
      if (!relation.foreignKey)
        missingRelationOption(source, relation, 'foreignKey');
      return {
        source,
        relation,
        target,
        sourceKey,
        targetKey,
        sourceColumn: column(source, sourceKey),
        targetForeignKey: relation.foreignKey,
      };
    }
    if (!relation.through) missingRelationOption(source, relation, 'through');
    if (!relation.foreignKey)
      missingRelationOption(source, relation, 'foreignKey');
    if (!relation.otherKey) missingRelationOption(source, relation, 'otherKey');
    const through = await this.getCollection(relation.through);
    if (!through) {
      throw new RepositoryError(
        'COLLECTION_NOT_FOUND',
        `Relation through Collection "${relation.through}" does not exist.`,
        { collection: relation.through, relation: relation.name },
      );
    }
    return {
      source,
      relation,
      target,
      through,
      sourceKey,
      targetKey,
      sourceColumn: column(source, sourceKey),
      throughSourceForeignKey: relation.foreignKey,
      throughTargetForeignKey: relation.otherKey,
    };
  }
}

interface SelectionColumn {
  readonly column: string;
  readonly alias: string;
}

interface ResolvedRepositoryRelation {
  readonly source: CollectionDefinition;
  readonly relation: RelationFieldDefinition;
  readonly target: CollectionDefinition;
  readonly through?: CollectionDefinition;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly sourceColumn: string;
  readonly targetForeignKey?: string;
  readonly throughSourceForeignKey?: string;
  readonly throughTargetForeignKey?: string;
}

type RelationGraph = WeakMap<FilterRelationNode, ResolvedRepositoryRelation>;

function tableQuery(
  client: Knex,
  collection: CollectionDefinition,
  alias?: string,
): Knex.QueryBuilder {
  if (!alias) {
    const query = client(tableName(collection));
    return collection.db?.schema
      ? query.withSchema(collection.db.schema)
      : query;
  }
  return client
    .queryBuilder()
    .from(collectionReference(client, collection, alias));
}

function tableName(collection: CollectionDefinition): string {
  return naming(collection).collectionToTableName(collection.name!);
}

function collectionReference(
  client: Knex,
  collection: CollectionDefinition,
  alias: string,
): Knex.Raw {
  const aliasKeyword = isOracleClient(client) ? ' ' : ' as ';
  return collection.db?.schema
    ? client.raw(`??.??${aliasKeyword}??`, [
        collection.db.schema,
        tableName(collection),
        alias,
      ])
    : client.raw(`??${aliasKeyword}??`, [tableName(collection), alias]);
}

function isOracleClient(client: Knex): boolean {
  return (client.client.config as { client?: string }).client === 'oracledb';
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

function relationFields(
  collection: CollectionDefinition,
): RelationFieldDefinition[] {
  return (collection.fields ?? []).filter(
    (field): field is RelationFieldDefinition => 'target' in field,
  );
}

function relationHelper(field: string): string {
  return `__repository_relation_${field}`;
}

function relationParentHelper(field: string): string {
  return `__repository_parent_${field}`;
}

function uniqueSelectionColumns(
  columns: readonly SelectionColumn[],
): SelectionColumn[] {
  const result = new Map<string, SelectionColumn>();
  for (const item of columns) result.set(item.alias, item);
  return [...result.values()];
}

function unusedInternalAlias(used: Set<string>, base: string): string {
  let alias = base;
  let suffix = 1;
  while (used.has(alias)) {
    alias = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(alias);
  return alias;
}

function uniqueValues(values: readonly unknown[]): unknown[] {
  return [
    ...new Set(values.filter((value) => value !== null && value !== undefined)),
  ];
}

function associationKey(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'string')
    return String(value);
  return JSON.stringify(value);
}

function isToOne(relation: RelationFieldDefinition): boolean {
  return relation.type === 'belongsTo' || relation.type === 'hasOne';
}

function emptyRelation(resolved: ResolvedRepositoryRelation): null | [] {
  return isToOne(resolved.relation) ? null : [];
}

function projectRow(
  row: RepositoryRecord,
  fields: readonly string[],
  select: SelectNode | undefined,
): RepositoryRecord {
  const result = Object.fromEntries(fields.map((field) => [field, row[field]]));
  for (const relation of select?.includes ?? []) {
    result[relation.relation] = row[relation.relation];
  }
  return result;
}

function internalGroupResultCollection(
  plan: RepositoryGroupByPlan,
  outputs: readonly GroupByOutput[],
): CollectionDefinition {
  const fields = outputs.map((output, index): FieldDefinition => {
    if (index < plan.by.length) {
      const source = plan.collection.fields?.find(
        (field): field is FieldDefinition =>
          field.name === output.name && isScalarField(field),
      );
      if (!source) throw new Error('GroupBy source Field was not found.');
      return { ...source, name: output.internal };
    }
    const aggregate = plan.aggregate.items[index - plan.by.length];
    if (!aggregate) throw new Error('GroupBy aggregate was not found.');
    if (aggregate.kind === 'min' || aggregate.kind === 'max') {
      const source = plan.collection.fields?.find(
        (field): field is FieldDefinition =>
          field.name === aggregate.field && isScalarField(field),
      );
      if (!source) throw new Error('GroupBy aggregate Field was not found.');
      return { ...source, name: output.internal, nullable: true };
    }
    return {
      name: output.internal,
      type: aggregate.kind === 'count' ? 'integer' : 'decimal',
      nullable: aggregate.kind !== 'count',
    };
  });
  return {
    name: plan.collection.name,
    naming: { underscored: false },
    fields,
  };
}

function mapFilterFields(
  node: FilterGroupNode,
  fields: ReadonlyMap<string, string>,
): FilterGroupNode {
  return {
    ...node,
    items: node.items.map((item) => {
      if (item.kind === 'group') return mapFilterFields(item, fields);
      if (item.kind === 'relation') {
        throw new Error('GroupBy having does not support Relation filters.');
      }
      const field = fields.get(item.path[0]);
      if (!field) throw new Error('GroupBy having Field was not mapped.');
      return { ...item, path: [field] };
    }),
  };
}

function missingRelationOption(
  collection: CollectionDefinition,
  relation: RelationFieldDefinition,
  option: 'foreignKey' | 'through' | 'otherKey',
): never {
  throw new RepositoryError(
    'INVALID_AST',
    `Relation "${collection.name}.${relation.name}" requires ${option}.`,
    {
      collection: collection.name,
      relation: relation.name,
      details: { option },
    },
  );
}

function qualified(alias: string, columnName: string): string {
  return `${alias}.${columnName}`;
}

function applyOrderBy(
  query: Knex.QueryBuilder,
  client: Knex,
  value: string | Knex.QueryBuilder,
  direction: 'asc' | 'desc',
  nulls: 'first' | 'last',
): void {
  const nullValue =
    typeof value === 'string' ? client.ref(value) : value.clone();
  query.orderBy(
    client.raw(
      nulls === 'last'
        ? 'case when (?) is null then 1 else 0 end'
        : 'case when (?) is null then 0 else 1 end',
      [nullValue],
    ),
    'asc',
  );
  query.orderBy(value, direction);
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

function mapUpdate(
  client: Knex,
  collection: CollectionDefinition,
  values: RepositoryRecord,
): Record<string, RepositoryRecord[string] | Knex.Raw> {
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => {
      const name = column(collection, field);
      if (
        !isNumericMutation(value) ||
        collection.fields?.find((item) => item.name === field)?.type === 'json'
      )
        return [name, value];
      const operator = {
        increment: '+',
        decrement: '-',
        multiply: '*',
        divide: '/',
      }[value.operation];
      return [
        name,
        client.raw(`?? ${operator} ?`, [
          name,
          typeof value.value === 'bigint' ? String(value.value) : value.value,
        ]),
      ];
    }),
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
  graph: RelationGraph,
  sourceAlias?: string,
  client?: Knex,
  depth = 0,
): void {
  if (!root || root.items.length === 0) return;
  query.where(function applyRoot(): void {
    applyGroupItems(this, collection, root, graph, sourceAlias, client, depth);
  });
}

function applyCursor(
  query: Knex.QueryBuilder,
  cursor: readonly RepositoryCursorAxis[] | undefined,
  resolveField: (field: string) => string,
): void {
  if (!cursor || cursor.length === 0) return;
  query.andWhere(function cursorBoundary(this: Knex.QueryBuilder): void {
    for (const [index, axis] of cursor.entries()) {
      this.orWhere(function cursorBranch(this: Knex.QueryBuilder): void {
        for (const previous of cursor.slice(0, index)) {
          this.andWhere(
            resolveField(previous.field),
            '=',
            previous.value as Knex.Value,
          );
        }
        this.andWhere(
          resolveField(axis.field),
          axis.direction === 'asc' ? '>' : '<',
          axis.value as Knex.Value,
        );
      });
    }
  });
}

function relationCursorAxes(
  node: SelectIncludeNode,
): RepositoryCursorAxis[] | undefined {
  if (!node.cursor) return undefined;
  return node.sort?.items.map((item) => {
    if (item.kind !== 'field' || item.path.length !== 1) {
      throw new Error('Relation cursor requires direct Field sort.');
    }
    return {
      field: item.path[0],
      direction: item.direction,
      value: node.cursor?.[item.path[0]],
    };
  });
}

function applyGroupItems(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  group: FilterGroupNode,
  graph: RelationGraph,
  sourceAlias: string | undefined,
  client: Knex | undefined,
  depth: number,
): void {
  group.items.forEach((node, index) => {
    applyNode(
      query,
      collection,
      node,
      index === 0 ? 'and' : group.logic,
      graph,
      sourceAlias,
      client,
      depth,
    );
  });
}

function applyNode(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  node: FilterNode,
  boolean: 'and' | 'or',
  graph: RelationGraph,
  sourceAlias: string | undefined,
  client: Knex | undefined,
  depth: number,
): void {
  const method = boolean === 'or' ? 'orWhere' : 'where';
  if (node.kind === 'group') {
    query[method](function applyNested(): void {
      applyGroupItems(
        this,
        collection,
        node,
        graph,
        sourceAlias,
        client,
        depth,
      );
    });
    return;
  }
  if (node.kind === 'relation') {
    if (!client || !sourceAlias) {
      throw new Error('Relation filters require an aliased Repository query.');
    }
    const resolved = graph.get(node);
    if (!resolved) {
      throw new Error('Relation filter metadata was not prepared.');
    }
    applyRelationFilter(
      query,
      node,
      resolved,
      graph,
      sourceAlias,
      client,
      boolean,
      depth,
    );
    return;
  }
  applyCondition(query, collection, node, boolean, sourceAlias);
}

function applyCondition(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  node: FilterConditionNode,
  boolean: 'and' | 'or',
  sourceAlias?: string,
): void {
  const directColumn = column(collection, node.path[0]);
  const name = sourceAlias
    ? qualified(sourceAlias, directColumn)
    : directColumn;
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

function applyRelationFilter(
  query: Knex.QueryBuilder,
  node: FilterRelationNode,
  resolved: ResolvedRepositoryRelation,
  graph: RelationGraph,
  sourceAlias: string,
  client: Knex,
  boolean: 'and' | 'or',
  depth: number,
): void {
  const targetAlias = `repository_filter_${depth}`;
  const throughAlias = `repository_filter_through_${depth}`;
  const subquery = tableQuery(client, resolved.target, targetAlias).select(
    client.raw('1'),
  );
  correlateRelation(
    subquery,
    resolved,
    sourceAlias,
    targetAlias,
    throughAlias,
    client,
  );
  if (node.filter) {
    applyFilter(
      subquery,
      resolved.target,
      node.filter,
      graph,
      targetAlias,
      client,
      depth + 1,
    );
  }
  const negate =
    node.quantifier === 'none' ||
    node.quantifier === 'notExists' ||
    node.quantifier === 'empty';
  const method = negate
    ? boolean === 'or'
      ? 'orWhereNotExists'
      : 'whereNotExists'
    : boolean === 'or'
      ? 'orWhereExists'
      : 'whereExists';
  query[method](subquery);
}

type RelationSortValue =
  | { readonly kind: 'field'; readonly field: string }
  | {
      readonly kind: 'aggregate';
      readonly aggregate: 'count' | 'sum' | 'avg' | 'min' | 'max';
      readonly field?: string;
    };

function relationSortSubquery(
  client: Knex,
  path: readonly ResolvedRepositoryRelation[],
  sourceAlias: string,
  value: RelationSortValue,
): Knex.QueryBuilder {
  const [first, ...rest] = path;
  if (!first) throw new Error('Relation sort path must not be empty.');
  const firstAlias = 'repository_sort_0';
  const query = tableQuery(client, first.target, firstAlias);
  correlateRelation(
    query,
    first,
    sourceAlias,
    firstAlias,
    'repository_sort_through_0',
    client,
  );
  let currentAlias = firstAlias;
  let currentCollection = first.target;
  for (const [index, resolved] of rest.entries()) {
    const targetAlias = `repository_sort_${index + 1}`;
    joinRelation(
      query,
      resolved,
      currentAlias,
      targetAlias,
      `repository_sort_through_${index + 1}`,
      client,
    );
    currentAlias = targetAlias;
    currentCollection = resolved.target;
  }
  if (value.kind === 'field') {
    return query.select(
      qualified(currentAlias, column(currentCollection, value.field)),
    );
  }
  const aggregateColumn = value.field
    ? qualified(currentAlias, column(currentCollection, value.field))
    : '*';
  if (value.aggregate === 'count') return query.count(aggregateColumn);
  if (value.aggregate === 'sum') {
    return query.select(client.raw('coalesce(sum(??), 0)', [aggregateColumn]));
  }
  return query[value.aggregate](aggregateColumn);
}

function joinRelation(
  query: Knex.QueryBuilder,
  resolved: ResolvedRepositoryRelation,
  sourceAlias: string,
  targetAlias: string,
  throughAlias: string,
  client: Knex,
): void {
  if (resolved.relation.type === 'belongsTo') {
    query.join(
      collectionReference(client, resolved.target, targetAlias),
      qualified(targetAlias, column(resolved.target, resolved.targetKey)),
      qualified(sourceAlias, resolved.sourceColumn),
    );
    return;
  }
  if (
    resolved.relation.type === 'hasOne' ||
    resolved.relation.type === 'hasMany'
  ) {
    query.join(
      collectionReference(client, resolved.target, targetAlias),
      qualified(
        targetAlias,
        column(resolved.target, resolved.targetForeignKey!),
      ),
      qualified(sourceAlias, column(resolved.source, resolved.sourceKey)),
    );
    return;
  }
  query
    .join(
      collectionReference(client, resolved.through!, throughAlias),
      qualified(
        throughAlias,
        column(resolved.through!, resolved.throughSourceForeignKey!),
      ),
      qualified(sourceAlias, column(resolved.source, resolved.sourceKey)),
    )
    .join(
      collectionReference(client, resolved.target, targetAlias),
      qualified(targetAlias, column(resolved.target, resolved.targetKey)),
      qualified(
        throughAlias,
        column(resolved.through!, resolved.throughTargetForeignKey!),
      ),
    );
}

function correlateRelation(
  query: Knex.QueryBuilder,
  resolved: ResolvedRepositoryRelation,
  sourceAlias: string,
  targetAlias: string,
  throughAlias: string,
  client: Knex,
): void {
  switch (resolved.relation.type) {
    case 'belongsTo':
      query.whereRaw('?? = ??', [
        qualified(targetAlias, column(resolved.target, resolved.targetKey)),
        qualified(sourceAlias, resolved.sourceColumn),
      ]);
      return;
    case 'hasOne':
    case 'hasMany':
      query.whereRaw('?? = ??', [
        qualified(
          targetAlias,
          column(resolved.target, resolved.targetForeignKey!),
        ),
        qualified(sourceAlias, column(resolved.source, resolved.sourceKey)),
      ]);
      return;
    case 'belongsToMany':
      query
        .join(
          collectionReference(client, resolved.through!, throughAlias),
          qualified(
            throughAlias,
            column(resolved.through!, resolved.throughTargetForeignKey!),
          ),
          qualified(targetAlias, column(resolved.target, resolved.targetKey)),
        )
        .whereRaw('?? = ??', [
          qualified(
            throughAlias,
            column(resolved.through!, resolved.throughSourceForeignKey!),
          ),
          qualified(sourceAlias, column(resolved.source, resolved.sourceKey)),
        ]);
  }
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

function applySelectors(
  query: Knex.QueryBuilder,
  collection: CollectionDefinition,
  selectors: readonly UniqueSelector[],
): void {
  query.where(function applySelectorSet(this: Knex.QueryBuilder): void {
    for (const selector of selectors) {
      this.orWhere(function applySelector(this: Knex.QueryBuilder): void {
        applyUnique(this, collection, selector);
      });
    }
  });
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
  const version = record[collection.optimisticLock.field];
  if (
    typeof version === 'string' &&
    /^-?\d+$/u.test(version) &&
    Number.isSafeInteger(Number(version))
  ) {
    return Number(version);
  }
  return version as string | number | undefined;
}

function firstReturnedRow(value: unknown): RepositoryRecord | undefined {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : undefined;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const code = record.code;
    const number = record.errno ?? record.number ?? record.errorNum;
    if (
      code === '23505' ||
      code === 'ER_DUP_ENTRY' ||
      code === 'SQLITE_CONSTRAINT' ||
      code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      code === 'SQLITE_CONSTRAINT_PRIMARYKEY' ||
      number === 1 ||
      number === 1062 ||
      number === 2601 ||
      number === 2627
    ) {
      return true;
    }
    current = record.cause ?? record.originalError;
  }
  return false;
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

function selectorFromRecord(
  collection: CollectionDefinition,
  record: RepositoryRecord,
): UniqueSelector {
  const constraint = (collection.constraints ?? []).find(
    (candidate) =>
      (candidate.type === 'primary' || candidate.type === 'unique') &&
      candidate.fields.every((field) => record[field] !== undefined),
  );
  if (
    !constraint ||
    constraint.type === 'foreignKey' ||
    constraint.type === 'check'
  ) {
    throw new Error('Repository record has no usable unique selector.');
  }
  return {
    kind: 'unique',
    fields: constraint.fields,
    values: Object.fromEntries(
      constraint.fields.map((field) => [field, record[field]]),
    ),
  };
}

function selectorFromFields(
  collection: CollectionDefinition,
  record: RepositoryRecord,
  fields: readonly string[],
): UniqueSelector {
  const values = Object.fromEntries(
    fields.map((field) => [field, record[field]]),
  );
  if (fields.some((field) => values[field] === undefined)) {
    throw new Error(
      `Repository record for Collection "${collection.name}" has no value for its stable identity.`,
    );
  }
  return { kind: 'unique', fields, values };
}

function relationForeignKeyNullable(
  resolved: ResolvedRepositoryRelation,
): boolean {
  const field = resolved.target.fields?.find(
    (candidate) => candidate.name === resolved.targetForeignKey,
  );
  return Boolean(field && isScalarField(field) && field.nullable !== false);
}

function relationActionNotAllowed(
  resolved: ResolvedRepositoryRelation,
  action: string,
): never {
  throw new RepositoryError(
    'RELATION_ACTION_NOT_ALLOWED',
    `Action "${action}" is not allowed for Relation "${resolved.relation.name}".`,
    {
      collection: resolved.source.name,
      relation: resolved.relation.name,
      details: { received: action },
    },
  );
}

function relationTargetNotFound(resolved: ResolvedRepositoryRelation): never {
  throw new RepositoryError(
    'RELATION_TARGET_NOT_FOUND',
    'Relation target was not found in the current relation scope.',
    {
      collection: resolved.source.name,
      relation: resolved.relation.name,
    },
  );
}

function multipleRelationTargetsMatched(
  resolved: ResolvedRepositoryRelation,
): never {
  throw new RepositoryError(
    'MULTIPLE_RELATION_TARGETS_MATCHED',
    'Relation target filter matched more than one record in the current relation scope.',
    {
      collection: resolved.source.name,
      relation: resolved.relation.name,
    },
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

function selectorsFilter(selectors: readonly UniqueSelector[]): FilterAst {
  return {
    kind: 'filter',
    version: 1,
    root: {
      kind: 'group',
      logic: 'or',
      items: selectors.map((selector) => uniqueFilter(selector).root),
    },
  };
}

function stableIdentityFields(collection: CollectionDefinition): string[] {
  const constraint = (collection.constraints ?? []).find(
    (candidate) => candidate.type === 'primary',
  );
  if (constraint?.type === 'primary') return [...constraint.fields];
  const unique = (collection.constraints ?? []).find(
    (candidate) => candidate.type === 'unique',
  );
  if (unique?.type === 'unique') return [...unique.fields];
  throw new Error('Repository Collection has no stable identity fields.');
}

function selectorKey(selector: UniqueSelector): string {
  return selector.fields
    .map(
      (field) =>
        `${JSON.stringify(field)}:${associationKey(selector.values[field])}`,
    )
    .join('|');
}

function assertBulkMutationCount(
  operation: 'updateMany' | 'deleteMany',
  affected: number,
  expected: number,
): void {
  if (affected !== expected) {
    throw new Error(
      `${operation} affected ${affected} records after locking ${expected} records.`,
    );
  }
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
