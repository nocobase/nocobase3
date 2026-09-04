import type { Knex } from 'knex';
import type {
  AnyFieldDefinition,
  CollectionDefinition,
  FieldDefinition,
  RelationFieldDefinition,
} from '../../collection/types.js';
import { DefaultNamingStrategy } from '../../naming/default-strategy.js';
import { RepositoryError } from '../errors.js';
import type {
  FilterAst,
  FilterConditionNode,
  FilterGroupNode,
  FilterNode,
  FilterRelationNode,
  FilterValue,
  RepositoryRecord,
  SelectNode,
  SelectRelationNode,
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
  constructor(
    private readonly getClient: () => Knex,
    private readonly getCollection: (
      name: string,
    ) => Promise<CollectionDefinition | undefined>,
  ) {}

  async findMany(plan: RepositoryReadPlan): Promise<RepositoryRecord[]> {
    const rows = (await await this.buildRead(plan)) as RepositoryRecord[];
    if (plan.select?.root.relations?.length) {
      await this.loadRelations(plan.collection, rows, plan.select.root);
    }
    return rows.map((row) => projectRow(row, plan.fields, plan.select?.root));
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
    return affectedCount(await query);
  }

  private async buildRead(
    plan: RepositoryReadPlan,
  ): Promise<Knex.QueryBuilder> {
    const client = this.getClient();
    const fields = await this.selectionFields(
      plan.collection,
      plan.fields,
      plan.select?.root,
    );
    const alias = 'repository_root';
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
    for (const item of plan.sort?.items ?? []) {
      await this.applySort(query, plan.collection, item, alias);
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
    for (const node of select?.relations ?? []) {
      const resolved = await this.resolveRelation(collection, node.field);
      selected.push({
        column: resolved.sourceColumn,
        alias: relationHelper(node.field),
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
    for (const node of select.relations ?? []) {
      await this.loadRelation(collection, rows, node);
    }
  }

  private async loadRelation(
    collection: CollectionDefinition,
    parents: RepositoryRecord[],
    node: SelectRelationNode,
  ): Promise<void> {
    const resolved = await this.resolveRelation(collection, node.field);
    const parentValues = uniqueValues(
      parents.map((parent) => parent[relationHelper(node.field)]),
    );
    if (parentValues.length === 0) {
      for (const parent of parents)
        parent[node.field] = emptyRelation(resolved);
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
        alias: relationParentHelper(node.field),
      });
    }
    for (const child of node.select.relations ?? []) {
      const childRelation = await this.resolveRelation(
        resolved.target,
        child.field,
      );
      selected.push({
        column: childRelation.sourceColumn,
        alias: relationHelper(child.field),
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
            .as(relationParentHelper(node.field)),
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
    for (const item of node.sort?.items ?? []) {
      await this.applySort(query, resolved.target, item, targetAlias);
    }
    const targets = (await query) as RepositoryRecord[];
    if (node.select.relations?.length) {
      await this.loadRelations(resolved.target, targets, node.select);
    }

    const grouped = new Map<unknown, RepositoryRecord[]>();
    for (const target of targets) {
      const key = target[relationParentHelper(node.field)];
      const group = grouped.get(key) ?? [];
      group.push(projectRow(target, requested, node.select));
      grouped.set(key, group);
    }
    for (const parent of parents) {
      const matches = grouped.get(parent[relationHelper(node.field)]) ?? [];
      parent[node.field] = isToOne(resolved.relation)
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
    item: SortItemNode,
    sourceAlias: string,
  ): Promise<void> {
    const client = this.getClient();
    if (item.by.kind === 'field') {
      applyOrderBy(
        query,
        client,
        qualified(sourceAlias, column(collection, item.by.field)),
        item.direction,
        item.nulls ?? 'last',
      );
      return;
    }
    const path = await this.resolveRelationPath(collection, item.by.relation);
    const value = relationSortSubquery(
      client,
      path,
      sourceAlias,
      item.by.kind === 'relationField'
        ? { kind: 'field', field: item.by.field }
        : {
            kind: 'aggregate',
            aggregate: item.by.aggregate,
            field: item.by.field,
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
  return collection.db?.schema
    ? client.raw('??.?? as ??', [
        collection.db.schema,
        tableName(collection),
        alias,
      ])
    : client.raw('?? as ??', [tableName(collection), alias]);
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

function uniqueValues(values: readonly unknown[]): unknown[] {
  return [
    ...new Set(values.filter((value) => value !== null && value !== undefined)),
  ];
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
  for (const relation of select?.relations ?? []) {
    result[relation.field] = row[relation.field];
  }
  return result;
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
