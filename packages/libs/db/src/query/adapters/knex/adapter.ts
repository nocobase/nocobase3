import type { Knex } from 'knex';
import type { NamingStrategy } from '../../../naming/index.js';
import type {
  AggregateExpression,
  AliasedExpression,
  ComparisonOperator,
  CompiledQuery,
  DeleteQuery,
  DeleteResult,
  Expression,
  ExpressionBuilder,
  ExpressionFactory,
  ExpressionInput,
  FunctionModule,
  InsertQuery,
  InsertResult,
  JoinBuilder,
  JoinCallback,
  OperandValueExpressionOrList,
  OrderDirection,
  QueryAdapter,
  ReferenceExpression,
  Row,
  SelectQuery,
  SelectionExpression,
  SelectionFactory,
  SqlBool,
  SubqueryBuilder,
  UpdateQuery,
  UpdateResult,
} from '../../types.js';

export class KnexQueryAdapter implements QueryAdapter {
  constructor(
    private readonly getClient: () => Knex,
    private readonly naming: NamingStrategy,
  ) {}

  selectFrom<TRecord extends Row = Row>(
    table: string,
  ): SelectQuery<TRecord, Row> {
    return new KnexSelectQuery<TRecord>(this.getClient, this.naming, table);
  }

  insertInto<TRecord extends Row = Row>(table: string): InsertQuery<TRecord> {
    return new KnexInsertQuery<TRecord>(this.getClient, this.naming, table);
  }

  updateTable<TRecord extends Row = Row>(table: string): UpdateQuery<TRecord> {
    return new KnexUpdateQuery<TRecord>(this.getClient, this.naming, table);
  }

  deleteFrom<TRecord extends Row = Row>(table: string): DeleteQuery<TRecord> {
    return new KnexDeleteQuery<TRecord>(this.getClient, this.naming, table);
  }
}

type SelectItem =
  | { type: 'selection'; selection: SelectionExpression }
  | { type: 'all'; table?: string };

interface OrderByItem {
  column: string;
  direction: OrderDirection;
}

interface JoinItem {
  type: 'inner' | 'left' | 'right' | 'cross';
  table: string;
  conditions: ExpressionNode[];
}

interface SelectState {
  selections: SelectItem[];
  distinct: boolean;
  joins: JoinItem[];
  where: ExpressionNode[];
  groupBy: string[];
  having: ExpressionNode[];
  orderBy: OrderByItem[];
  limit?: number;
  offset?: number;
}

interface MutationState {
  where: ExpressionNode[];
  allowAllRows: boolean;
}

const emptySelectState = (): SelectState => ({
  selections: [],
  distinct: false,
  joins: [],
  where: [],
  groupBy: [],
  having: [],
  orderBy: [],
});

const emptyMutationState = (): MutationState => ({
  where: [],
  allowAllRows: false,
});

class KnexSelectQuery<
  TRecord extends Row = Row,
  TResult extends Row = TRecord,
> implements SelectQuery<TRecord, TResult> {
  constructor(
    private readonly getClient: () => Knex,
    private readonly naming: NamingStrategy,
    private readonly tableName: string,
    private readonly state: SelectState = emptySelectState(),
  ) {}

  select(
    input:
      SelectionExpression | readonly SelectionExpression[] | SelectionFactory,
  ): SelectQuery<TRecord, Row> {
    return this.clone<Row>({
      selections: [
        ...this.state.selections,
        ...normalizeSelectionInput(input, this.createExpressionBuilder()).map(
          (selection) => ({
            type: 'selection' as const,
            selection,
          }),
        ),
      ],
    });
  }

  selectAll(table?: string): SelectQuery<TRecord, Row> {
    return this.clone<Row>({
      selections: [...this.state.selections, { type: 'all', table }],
    });
  }

  distinct(): SelectQuery<TRecord, TResult> {
    return this.clone({ distinct: true });
  }

  where(
    lhsOrExpression:
      ReferenceExpression | Expression<unknown> | ExpressionFactory<SqlBool>,
    op?: ComparisonOperator,
    rhs?: OperandValueExpressionOrList,
  ): SelectQuery<TRecord, TResult> {
    return this.clone({
      where: [
        ...this.state.where,
        resolveConditionArguments(
          arguments,
          lhsOrExpression,
          op,
          rhs,
          this.createExpressionBuilder(),
        ),
      ],
    });
  }

  whereRef(
    lhs: ReferenceExpression,
    op: ComparisonOperator,
    rhs: ReferenceExpression,
  ): SelectQuery<TRecord, TResult> {
    return this.clone({
      where: [
        ...this.state.where,
        binaryExpressionNode(
          lhs,
          op,
          createExpression({ type: 'ref', reference: rhs }),
        ),
      ],
    });
  }

  innerJoin(
    table: string,
    leftRefOrCallback: ReferenceExpression | JoinCallback,
    rightRef?: ReferenceExpression,
  ): SelectQuery<TRecord, TResult> {
    return this.join('inner', table, leftRefOrCallback, rightRef);
  }

  leftJoin(
    table: string,
    leftRefOrCallback: ReferenceExpression | JoinCallback,
    rightRef?: ReferenceExpression,
  ): SelectQuery<TRecord, TResult> {
    return this.join('left', table, leftRefOrCallback, rightRef);
  }

  rightJoin(
    table: string,
    leftRefOrCallback: ReferenceExpression | JoinCallback,
    rightRef?: ReferenceExpression,
  ): SelectQuery<TRecord, TResult> {
    return this.join('right', table, leftRefOrCallback, rightRef);
  }

  crossJoin(table: string): SelectQuery<TRecord, TResult> {
    return this.clone({
      joins: [...this.state.joins, { type: 'cross', table, conditions: [] }],
    });
  }

  groupBy(input: string | readonly string[]): SelectQuery<TRecord, TResult> {
    return this.clone({
      groupBy: [...this.state.groupBy, ...normalizeStringList(input)],
    });
  }

  having(
    lhsOrExpression:
      ReferenceExpression | Expression<unknown> | ExpressionFactory<SqlBool>,
    op?: ComparisonOperator,
    rhs?: OperandValueExpressionOrList,
  ): SelectQuery<TRecord, TResult> {
    return this.clone({
      having: [
        ...this.state.having,
        resolveConditionArguments(
          arguments,
          lhsOrExpression,
          op,
          rhs,
          this.createExpressionBuilder(),
        ),
      ],
    });
  }

  havingRef(
    lhs: ReferenceExpression,
    op: ComparisonOperator,
    rhs: ReferenceExpression,
  ): SelectQuery<TRecord, TResult> {
    return this.clone({
      having: [
        ...this.state.having,
        binaryExpressionNode(
          lhs,
          op,
          createExpression({ type: 'ref', reference: rhs }),
        ),
      ],
    });
  }

  orderBy(
    column: string,
    direction: OrderDirection = 'asc',
  ): SelectQuery<TRecord, TResult> {
    return this.clone({
      orderBy: [...this.state.orderBy, { column, direction }],
    });
  }

  limit(count: number): SelectQuery<TRecord, TResult> {
    return this.clone({ limit: count });
  }

  offset(count: number): SelectQuery<TRecord, TResult> {
    return this.clone({ offset: count });
  }

  clearSelect(): SelectQuery<TRecord, Row> {
    return this.clone<Row>({ selections: [] });
  }

  clearWhere(): SelectQuery<TRecord, TResult> {
    return this.clone({ where: [] });
  }

  clearJoins(): SelectQuery<TRecord, TResult> {
    return this.clone({ joins: [] });
  }

  clearGroupBy(): SelectQuery<TRecord, TResult> {
    return this.clone({ groupBy: [] });
  }

  clearHaving(): SelectQuery<TRecord, TResult> {
    return this.clone({ having: [] });
  }

  clearOrderBy(): SelectQuery<TRecord, TResult> {
    return this.clone({ orderBy: [] });
  }

  clearLimit(): SelectQuery<TRecord, TResult> {
    return this.clone({ limit: undefined });
  }

  clearOffset(): SelectQuery<TRecord, TResult> {
    return this.clone({ offset: undefined });
  }

  async execute<T = TResult>(): Promise<T[]> {
    const { query, resultMap } = this.buildSelectQuery();
    const rows = await query;
    return normalizeRows(rows).map((row) =>
      mapResultRow(row, resultMap, this.naming),
    ) as T[];
  }

  async executeTakeFirst<T = TResult>(): Promise<T | undefined> {
    const { query, resultMap } = this.buildSelectQuery();
    const row = await query.first();
    return row === undefined
      ? undefined
      : (mapResultRow(row as Row, resultMap, this.naming) as T);
  }

  async executeTakeFirstOrThrow<T = TResult>(): Promise<T> {
    const row = await this.executeTakeFirst<T>();
    if (row === undefined) {
      throw new Error('No row found.');
    }
    return row;
  }

  async value<T = unknown>(column: string): Promise<T | undefined> {
    const row = await this.clearSelect().select(column).executeTakeFirst<Row>();
    return row?.[logicalResultKeyForSelection(column)] as T | undefined;
  }

  async pluck<T = unknown>(column: string): Promise<T[]> {
    const rows = await this.clearSelect().select(column).execute<Row>();
    const key = logicalResultKeyForSelection(column);
    return rows.map((row) => row[key] as T);
  }

  async exists(): Promise<boolean> {
    const client = this.getClient();
    const tableScope = this.createTableScope();
    const query = this.buildFilteredQuery(client, tableScope)
      .select(client.raw('1 as value'))
      .limit(1);
    const row = await query.first();
    return row !== undefined;
  }

  compile(): CompiledQuery {
    const compiled = this.buildSelectQuery().query.toSQL();
    return {
      sql: compiled.sql,
      parameters: compiled.bindings ?? [],
    };
  }

  private join(
    type: JoinItem['type'],
    table: string,
    leftRefOrCallback: ReferenceExpression | JoinCallback,
    rightRef?: ReferenceExpression,
  ): SelectQuery<TRecord, TResult> {
    const conditions =
      typeof leftRefOrCallback === 'function'
        ? (
            leftRefOrCallback(
              new KnexJoinBuilder(this.createExpressionBuilder()),
            ) as KnexJoinBuilder
          ).conditions
        : [
            binaryExpressionNode(
              leftRefOrCallback,
              '=',
              createExpression({
                type: 'ref',
                reference: assertRightJoinReference(rightRef),
              }),
            ),
          ];

    return this.clone({
      joins: [...this.state.joins, { type, table, conditions }],
    });
  }

  private clone<TNextResult extends Row = TResult>(
    patch: Partial<SelectState>,
  ): KnexSelectQuery<TRecord, TNextResult> {
    return new KnexSelectQuery<TRecord, TNextResult>(
      this.getClient,
      this.naming,
      this.tableName,
      {
        selections: patch.selections ?? this.state.selections,
        distinct: patch.distinct ?? this.state.distinct,
        joins: patch.joins ?? this.state.joins,
        where: patch.where ?? this.state.where,
        groupBy: patch.groupBy ?? this.state.groupBy,
        having: patch.having ?? this.state.having,
        orderBy: patch.orderBy ?? this.state.orderBy,
        limit: Object.prototype.hasOwnProperty.call(patch, 'limit')
          ? patch.limit
          : this.state.limit,
        offset: Object.prototype.hasOwnProperty.call(patch, 'offset')
          ? patch.offset
          : this.state.offset,
      },
    );
  }

  private buildSelectQuery(): {
    query: Knex.QueryBuilder;
    resultMap: ResultMap;
  } {
    this.assertPortablePagination();

    const client = this.getClient();
    const tableScope = this.createTableScope();
    const query = this.buildFilteredQuery(client, tableScope);
    const resultMap = applySelections(query, this.state.selections, {
      client,
      naming: this.naming,
      getClient: this.getClient,
      clause: 'where',
      tableScope,
    });

    if (this.state.distinct) {
      query.distinct();
    }
    for (const column of this.state.groupBy) {
      query.groupBy(mapReference(column, this.naming, tableScope));
    }
    for (const expression of this.state.having) {
      applyExpressionNode(query, expression, {
        client,
        naming: this.naming,
        getClient: this.getClient,
        clause: 'having',
        tableScope,
      });
    }
    for (const item of this.state.orderBy) {
      query.orderBy(
        mapReference(item.column, this.naming, tableScope),
        item.direction,
      );
    }
    if (this.state.limit !== undefined) {
      query.limit(this.state.limit);
    }
    if (this.state.offset !== undefined) {
      query.offset(this.state.offset);
    }
    return { query, resultMap };
  }

  private buildFilteredQuery(
    client: Knex,
    tableScope: TableScope,
  ): Knex.QueryBuilder {
    const query = client(mapTableSourceExpression(this.tableName, this.naming));
    for (const join of this.state.joins) {
      applyJoin(query, join, {
        client,
        naming: this.naming,
        getClient: this.getClient,
        clause: 'where',
        tableScope,
      });
    }
    for (const expression of this.state.where) {
      applyExpressionNode(query, expression, {
        client,
        naming: this.naming,
        getClient: this.getClient,
        clause: 'where',
        tableScope,
      });
    }
    return query;
  }

  private createExpressionBuilder(): ExpressionBuilder {
    return createExpressionBuilder(this.getClient, this.naming);
  }

  private createTableScope(): TableScope {
    return createTableScope(
      [this.tableName, ...this.state.joins.map((join) => join.table)],
      this.naming,
    );
  }

  private assertPortablePagination(): void {
    if (this.state.offset !== undefined && this.state.orderBy.length === 0) {
      throw new Error('offset() requires orderBy() for portable pagination.');
    }
  }
}

class KnexInsertQuery<
  TRecord extends Row = Row,
> implements InsertQuery<TRecord> {
  constructor(
    private readonly getClient: () => Knex,
    private readonly naming: NamingStrategy,
    private readonly tableName: string,
    private readonly data?: TRecord | readonly TRecord[],
  ) {}

  values(data: TRecord | readonly TRecord[]): InsertQuery<TRecord> {
    return new KnexInsertQuery(
      this.getClient,
      this.naming,
      this.tableName,
      data,
    );
  }

  async execute(): Promise<InsertResult> {
    const data = this.requireValues();
    const result = await this.buildQuery(data);
    return normalizeInsertResult(result, data);
  }

  compile(): CompiledQuery {
    const compiled = this.buildQuery(this.requireValues()).toSQL();
    return {
      sql: compiled.sql,
      parameters: compiled.bindings ?? [],
    };
  }

  private buildQuery(data: TRecord | readonly TRecord[]): Knex.QueryBuilder {
    return this.getClient()(
      mapTableSourceExpression(this.tableName, this.naming),
    ).insert(mapData(data, this.naming) as any);
  }

  private requireValues(): TRecord | readonly TRecord[] {
    if (this.data === undefined) {
      throw new Error('insertInto().values() is required before execute().');
    }
    return this.data;
  }
}

class KnexUpdateQuery<
  TRecord extends Row = Row,
> implements UpdateQuery<TRecord> {
  constructor(
    private readonly getClient: () => Knex,
    private readonly naming: NamingStrategy,
    private readonly tableName: string,
    private readonly data?: Partial<TRecord>,
    private readonly state: MutationState = emptyMutationState(),
  ) {}

  set(data: Partial<TRecord>): UpdateQuery<TRecord> {
    return new KnexUpdateQuery(
      this.getClient,
      this.naming,
      this.tableName,
      data,
      this.state,
    );
  }

  where(
    lhsOrExpression:
      ReferenceExpression | Expression<unknown> | ExpressionFactory<SqlBool>,
    op?: ComparisonOperator,
    rhs?: OperandValueExpressionOrList,
  ): UpdateQuery<TRecord> {
    return this.clone({
      where: [
        ...this.state.where,
        resolveConditionArguments(
          arguments,
          lhsOrExpression,
          op,
          rhs,
          this.createExpressionBuilder(),
        ),
      ],
    });
  }

  whereRef(
    lhs: ReferenceExpression,
    op: ComparisonOperator,
    rhs: ReferenceExpression,
  ): UpdateQuery<TRecord> {
    return this.clone({
      where: [
        ...this.state.where,
        binaryExpressionNode(
          lhs,
          op,
          createExpression({ type: 'ref', reference: rhs }),
        ),
      ],
    });
  }

  clearWhere(): UpdateQuery<TRecord> {
    return this.clone({ where: [] });
  }

  allowAllRows(): UpdateQuery<TRecord> {
    return this.clone({ allowAllRows: true });
  }

  async execute(): Promise<UpdateResult> {
    const result = await this.buildQuery();
    return normalizeUpdateResult(result);
  }

  compile(): CompiledQuery {
    const compiled = this.buildQuery().toSQL();
    return {
      sql: compiled.sql,
      parameters: compiled.bindings ?? [],
    };
  }

  private clone(patch: Partial<MutationState>): KnexUpdateQuery<TRecord> {
    return new KnexUpdateQuery(
      this.getClient,
      this.naming,
      this.tableName,
      this.data,
      {
        where: patch.where ?? this.state.where,
        allowAllRows: patch.allowAllRows ?? this.state.allowAllRows,
      },
    );
  }

  private buildQuery(): Knex.QueryBuilder {
    const client = this.getClient();
    const tableScope = createTableScope([this.tableName], this.naming);
    const data = this.requireSetData();
    this.assertWhereSafety('updateTable().execute()');
    const query = client(
      mapTableSourceExpression(this.tableName, this.naming),
    ).update(mapData(data, this.naming) as any);
    applyWhereExpressions(query, this.state.where, {
      client,
      naming: this.naming,
      getClient: this.getClient,
      clause: 'where',
      tableScope,
    });
    return query;
  }

  private requireSetData(): Partial<TRecord> {
    if (this.data === undefined) {
      throw new Error('updateTable().set() is required before execute().');
    }
    return this.data;
  }

  private assertWhereSafety(method: string): void {
    if (!this.state.allowAllRows && this.state.where.length === 0) {
      throw new Error(`${method} requires where() or allowAllRows().`);
    }
  }

  private createExpressionBuilder(): ExpressionBuilder {
    return createExpressionBuilder(this.getClient, this.naming);
  }
}

class KnexDeleteQuery<
  TRecord extends Row = Row,
> implements DeleteQuery<TRecord> {
  constructor(
    private readonly getClient: () => Knex,
    private readonly naming: NamingStrategy,
    private readonly tableName: string,
    private readonly state: MutationState = emptyMutationState(),
  ) {}

  where(
    lhsOrExpression:
      ReferenceExpression | Expression<unknown> | ExpressionFactory<SqlBool>,
    op?: ComparisonOperator,
    rhs?: OperandValueExpressionOrList,
  ): DeleteQuery<TRecord> {
    return this.clone({
      where: [
        ...this.state.where,
        resolveConditionArguments(
          arguments,
          lhsOrExpression,
          op,
          rhs,
          this.createExpressionBuilder(),
        ),
      ],
    });
  }

  whereRef(
    lhs: ReferenceExpression,
    op: ComparisonOperator,
    rhs: ReferenceExpression,
  ): DeleteQuery<TRecord> {
    return this.clone({
      where: [
        ...this.state.where,
        binaryExpressionNode(
          lhs,
          op,
          createExpression({ type: 'ref', reference: rhs }),
        ),
      ],
    });
  }

  clearWhere(): DeleteQuery<TRecord> {
    return this.clone({ where: [] });
  }

  allowAllRows(): DeleteQuery<TRecord> {
    return this.clone({ allowAllRows: true });
  }

  async execute(): Promise<DeleteResult> {
    const result = await this.buildQuery();
    return normalizeDeleteResult(result);
  }

  compile(): CompiledQuery {
    const compiled = this.buildQuery().toSQL();
    return {
      sql: compiled.sql,
      parameters: compiled.bindings ?? [],
    };
  }

  private clone(patch: Partial<MutationState>): KnexDeleteQuery<TRecord> {
    return new KnexDeleteQuery(this.getClient, this.naming, this.tableName, {
      where: patch.where ?? this.state.where,
      allowAllRows: patch.allowAllRows ?? this.state.allowAllRows,
    });
  }

  private buildQuery(): Knex.QueryBuilder {
    const client = this.getClient();
    const tableScope = createTableScope([this.tableName], this.naming);
    this.assertWhereSafety('deleteFrom().execute()');
    const query = client(
      mapTableSourceExpression(this.tableName, this.naming),
    ).delete();
    applyWhereExpressions(query, this.state.where, {
      client,
      naming: this.naming,
      getClient: this.getClient,
      clause: 'where',
      tableScope,
    });
    return query;
  }

  private assertWhereSafety(method: string): void {
    if (!this.state.allowAllRows && this.state.where.length === 0) {
      throw new Error(`${method} requires where() or allowAllRows().`);
    }
  }

  private createExpressionBuilder(): ExpressionBuilder {
    return createExpressionBuilder(this.getClient, this.naming);
  }
}

class KnexSubqueryBuilder<
  TResult extends Row = Row,
> implements SubqueryBuilder<TResult> {
  constructor(
    private readonly getClient: () => Knex,
    private readonly naming: NamingStrategy,
    private readonly tableName: string,
    private readonly state: SelectState = emptySelectState(),
  ) {}

  select(
    input:
      SelectionExpression | readonly SelectionExpression[] | SelectionFactory,
  ): SubqueryBuilder<TResult> {
    return this.clone({
      selections: [
        ...this.state.selections,
        ...normalizeSelectionInput(input, this.createExpressionBuilder()).map(
          (selection) => ({
            type: 'selection' as const,
            selection,
          }),
        ),
      ],
    });
  }

  selectAll(table?: string): SubqueryBuilder<TResult> {
    return this.clone({
      selections: [...this.state.selections, { type: 'all', table }],
    });
  }

  distinct(): SubqueryBuilder<TResult> {
    return this.clone({ distinct: true });
  }

  where(
    lhsOrExpression:
      ReferenceExpression | Expression<unknown> | ExpressionFactory<SqlBool>,
    op?: ComparisonOperator,
    rhs?: OperandValueExpressionOrList,
  ): SubqueryBuilder<TResult> {
    return this.clone({
      where: [
        ...this.state.where,
        resolveConditionArguments(
          arguments,
          lhsOrExpression,
          op,
          rhs,
          this.createExpressionBuilder(),
        ),
      ],
    });
  }

  whereRef(
    lhs: ReferenceExpression,
    op: ComparisonOperator,
    rhs: ReferenceExpression,
  ): SubqueryBuilder<TResult> {
    return this.clone({
      where: [
        ...this.state.where,
        binaryExpressionNode(
          lhs,
          op,
          createExpression({ type: 'ref', reference: rhs }),
        ),
      ],
    });
  }

  orderBy(
    column: string,
    direction: OrderDirection = 'asc',
  ): SubqueryBuilder<TResult> {
    return this.clone({
      orderBy: [...this.state.orderBy, { column, direction }],
    });
  }

  limit(count: number): SubqueryBuilder<TResult> {
    return this.clone({ limit: count });
  }

  offset(count: number): SubqueryBuilder<TResult> {
    return this.clone({ offset: count });
  }

  as<TAlias extends string>(alias: TAlias): AliasedExpression<TResult, TAlias> {
    return createAliasedExpression<TResult, TAlias>(
      {
        type: 'subquery',
        query: this,
      },
      alias,
    );
  }

  buildQuery(
    client = this.getClient(),
    parentScope?: TableScope,
  ): Knex.QueryBuilder {
    if (this.state.offset !== undefined && this.state.orderBy.length === 0) {
      throw new Error('offset() requires orderBy() for portable pagination.');
    }

    const tableScope = createTableScope(
      [this.tableName, ...this.state.joins.map((join) => join.table)],
      this.naming,
      parentScope,
    );
    const query = client(mapTableSourceExpression(this.tableName, this.naming));
    applySelections(query, this.state.selections, {
      client,
      naming: this.naming,
      getClient: this.getClient,
      clause: 'where',
      tableScope,
    });
    if (this.state.distinct) {
      query.distinct();
    }
    applyWhereExpressions(query, this.state.where, {
      client,
      naming: this.naming,
      getClient: this.getClient,
      clause: 'where',
      tableScope,
    });
    for (const item of this.state.orderBy) {
      query.orderBy(
        mapReference(item.column, this.naming, tableScope),
        item.direction,
      );
    }
    if (this.state.limit !== undefined) {
      query.limit(this.state.limit);
    }
    if (this.state.offset !== undefined) {
      query.offset(this.state.offset);
    }
    return query;
  }

  private clone(patch: Partial<SelectState>): KnexSubqueryBuilder<TResult> {
    return new KnexSubqueryBuilder<TResult>(
      this.getClient,
      this.naming,
      this.tableName,
      {
        selections: patch.selections ?? this.state.selections,
        distinct: patch.distinct ?? this.state.distinct,
        joins: patch.joins ?? this.state.joins,
        where: patch.where ?? this.state.where,
        groupBy: patch.groupBy ?? this.state.groupBy,
        having: patch.having ?? this.state.having,
        orderBy: patch.orderBy ?? this.state.orderBy,
        limit: Object.prototype.hasOwnProperty.call(patch, 'limit')
          ? patch.limit
          : this.state.limit,
        offset: Object.prototype.hasOwnProperty.call(patch, 'offset')
          ? patch.offset
          : this.state.offset,
      },
    );
  }

  private createExpressionBuilder(): ExpressionBuilder {
    return createExpressionBuilder(this.getClient, this.naming);
  }
}

class KnexJoinBuilder implements JoinBuilder {
  readonly conditions: ExpressionNode[];

  constructor(
    private readonly expressionBuilder: ExpressionBuilder,
    conditions: ExpressionNode[] = [],
  ) {
    this.conditions = conditions;
  }

  on(
    lhsOrExpression:
      ReferenceExpression | Expression<unknown> | ExpressionFactory<SqlBool>,
    op?: ComparisonOperator,
    rhs?: OperandValueExpressionOrList,
  ): JoinBuilder {
    return this.add(
      resolveConditionArguments(
        arguments,
        lhsOrExpression,
        op,
        rhs,
        this.expressionBuilder,
      ),
    );
  }

  onRef(
    lhs: ReferenceExpression,
    op: ComparisonOperator,
    rhs: ReferenceExpression,
  ): JoinBuilder {
    return this.add(
      binaryExpressionNode(
        lhs,
        op,
        createExpression({ type: 'ref', reference: rhs }),
      ),
    );
  }

  private add(expression: ExpressionNode): KnexJoinBuilder {
    return new KnexJoinBuilder(this.expressionBuilder, [
      ...this.conditions,
      expression,
    ]);
  }
}

type AggregateFunctionName =
  'count' | 'countAll' | 'sum' | 'avg' | 'min' | 'max';

type ExpressionNode =
  | {
      type: 'binary';
      lhs: OperandNode;
      op: ComparisonOperator;
      rhs: OperandNode;
    }
  | { type: 'and'; expressions: ExpressionNode[] }
  | { type: 'or'; expressions: ExpressionNode[] }
  | { type: 'not'; expression: ExpressionNode }
  | { type: 'between'; expression: OperandNode; start: unknown; end: unknown }
  | { type: 'exists'; query: KnexSubqueryBuilder }
  | { type: 'ref'; reference: ReferenceExpression }
  | { type: 'val'; value: unknown }
  | {
      type: 'aggregate';
      fn: AggregateFunctionName;
      operand?: OperandNode;
      distinct: boolean;
      table?: string;
    }
  | { type: 'parens'; expression: ExpressionNode }
  | { type: 'subquery'; query: KnexSubqueryBuilder }
  | { type: 'aliasedExpression'; expression: ExpressionNode; alias: string };

type OperandNode =
  | { type: 'value'; value: unknown }
  | { type: 'ref'; reference: ReferenceExpression }
  | { type: 'expression'; expression: ExpressionNode }
  | { type: 'subquery'; query: KnexSubqueryBuilder };

interface ExpressionCompileContext {
  client: Knex;
  naming: NamingStrategy;
  getClient: () => Knex;
  clause: 'where' | 'having';
  tableScope: TableScope;
}

interface TableScope {
  readonly qualifiers: ReadonlyMap<string, string>;
  readonly parent?: TableScope;
}

interface ResolvedTableSource {
  readonly sql: string;
  readonly logicalQualifier: string;
  readonly sqlQualifier: string;
}

interface ResultMap {
  explicit: Map<string, string>;
  mapUnmatchedColumns: boolean;
}

const expressionNodeSymbol = Symbol('NocoBaseQueryExpressionNode');

interface InternalExpression<T = unknown> extends Expression<T> {
  readonly [expressionNodeSymbol]: ExpressionNode;
}

function createExpression<T = unknown>(node: ExpressionNode): Expression<T> {
  return {
    [expressionNodeSymbol]: node,
  } as InternalExpression<T>;
}

function createAliasedExpression<T = unknown, TAlias extends string = string>(
  expression: ExpressionNode,
  alias: TAlias,
): AliasedExpression<T, TAlias> {
  return {
    [expressionNodeSymbol]: {
      type: 'aliasedExpression',
      expression,
      alias,
    },
    alias,
  } as unknown as AliasedExpression<T, TAlias>;
}

function createAggregateExpression<T = unknown>(
  node: Extract<ExpressionNode, { type: 'aggregate' }>,
): AggregateExpression<T> {
  const expression = createExpression<T>(node) as AggregateExpression<T>;
  expression.as = (alias) =>
    createAliasedExpression<T, typeof alias>(node, alias);
  expression.distinct = () =>
    createAggregateExpression<T>({ ...node, distinct: true });
  return expression;
}

function isExpression(value: unknown): value is InternalExpression {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === 'object' &&
    expressionNodeSymbol in value
  );
}

function getExpressionNode(expression: Expression<unknown>): ExpressionNode {
  if (!isExpression(expression)) {
    throw new Error('Invalid query expression.');
  }
  return expression[expressionNodeSymbol];
}

function createExpressionBuilder(
  getClient: () => Knex,
  naming: NamingStrategy,
): ExpressionBuilder {
  const builder = ((
    lhs: ReferenceExpression | Expression<unknown>,
    op: ComparisonOperator,
    rhs: OperandValueExpressionOrList,
  ) =>
    createExpression<SqlBool>(
      binaryExpressionNode(lhs, op, rhs),
    )) as ExpressionBuilder;

  Object.defineProperty(builder, 'eb', {
    enumerable: true,
    get: () => builder,
  });

  Object.defineProperty(builder, 'fn', {
    enumerable: true,
    get: () => createFunctionModule(),
  });

  builder.ref = (reference) => createExpression({ type: 'ref', reference });
  builder.val = (value) => createExpression({ type: 'val', value });
  builder.and = (expressions) =>
    createExpression({
      type: 'and',
      expressions: expressionListFromInput(expressions, builder),
    });
  builder.or = (expressions) =>
    createExpression({
      type: 'or',
      expressions: expressionListFromInput(expressions, builder),
    });
  builder.not = (expression) =>
    createExpression({
      type: 'not',
      expression: resolveExpressionInput(expression, builder),
    });
  builder.between = (expression, start, end) =>
    createExpression({
      type: 'between',
      expression: referenceOperandNode(expression),
      start,
      end,
    });
  builder.exists = (query) => {
    if (!(query instanceof KnexSubqueryBuilder)) {
      throw new Error(
        'exists() expects a subquery created by eb.selectFrom().',
      );
    }
    return createExpression({ type: 'exists', query });
  };
  builder.selectFrom = (table) =>
    new KnexSubqueryBuilder(getClient, naming, table);
  builder.parens = (expression) =>
    createExpression({
      type: 'parens',
      expression: resolveExpressionInput(expression, builder),
    });

  return builder;
}

function createFunctionModule(): FunctionModule {
  return {
    count: (column) =>
      createAggregateExpression({
        type: 'aggregate',
        fn: 'count',
        operand: referenceOperandNode(column),
        distinct: false,
      }),
    countAll: (table) =>
      createAggregateExpression({
        type: 'aggregate',
        fn: 'countAll',
        distinct: false,
        table,
      }),
    sum: (column) =>
      createAggregateExpression({
        type: 'aggregate',
        fn: 'sum',
        operand: referenceOperandNode(column),
        distinct: false,
      }),
    avg: (column) =>
      createAggregateExpression({
        type: 'aggregate',
        fn: 'avg',
        operand: referenceOperandNode(column),
        distinct: false,
      }),
    min: (column) =>
      createAggregateExpression({
        type: 'aggregate',
        fn: 'min',
        operand: referenceOperandNode(column),
        distinct: false,
      }),
    max: (column) =>
      createAggregateExpression({
        type: 'aggregate',
        fn: 'max',
        operand: referenceOperandNode(column),
        distinct: false,
      }),
  };
}

function resolveConditionArguments(
  args: IArguments,
  lhsOrExpression:
    ReferenceExpression | Expression<unknown> | ExpressionFactory<SqlBool>,
  op: ComparisonOperator | undefined,
  rhs: OperandValueExpressionOrList | undefined,
  builder: ExpressionBuilder,
): ExpressionNode {
  if (args.length === 1) {
    return resolveExpressionInput(
      lhsOrExpression as Expression<SqlBool> | ExpressionFactory<SqlBool>,
      builder,
    );
  }

  if (args.length !== 3 || op === undefined) {
    throw new Error(
      'where() expects either an expression callback or (lhs, operator, rhs).',
    );
  }

  return binaryExpressionNode(
    lhsOrExpression as ReferenceExpression | Expression<unknown>,
    op,
    rhs,
  );
}

function resolveExpressionInput<T>(
  input: ExpressionInput<T>,
  builder: ExpressionBuilder,
): ExpressionNode {
  if (typeof input === 'function' && !isExpression(input)) {
    return getExpressionNode(input(builder));
  }
  return getExpressionNode(input);
}

function expressionListFromInput(
  expressions: readonly ExpressionInput<SqlBool>[] | Record<string, unknown>,
  builder: ExpressionBuilder,
): ExpressionNode[] {
  if (Array.isArray(expressions)) {
    return expressions.map((expression) =>
      resolveExpressionInput(expression, builder),
    );
  }

  return Object.entries(expressions).map(([field, value]) =>
    binaryExpressionNode(field, '=', value),
  );
}

function binaryExpressionNode(
  lhs: ReferenceExpression | Expression<unknown>,
  op: ComparisonOperator,
  rhs: OperandValueExpressionOrList,
): ExpressionNode {
  return {
    type: 'binary',
    lhs: referenceOperandNode(lhs),
    op: normalizeComparisonOperator(op),
    rhs: operandNode(rhs),
  };
}

function referenceOperandNode(
  value: ReferenceExpression | Expression<unknown>,
): OperandNode {
  if (typeof value === 'string') {
    return { type: 'ref', reference: value };
  }
  return operandNode(value);
}

function operandNode(
  value: OperandValueExpressionOrList | Expression<unknown>,
): OperandNode {
  if (isExpression(value)) {
    const expression = getExpressionNode(value);
    if (expression.type === 'ref') {
      return { type: 'ref', reference: expression.reference };
    }
    if (expression.type === 'val') {
      return { type: 'value', value: expression.value };
    }
    if (expression.type === 'subquery') {
      return { type: 'subquery', query: expression.query };
    }
    if (
      expression.type === 'aliasedExpression' &&
      expression.expression.type === 'subquery'
    ) {
      return { type: 'subquery', query: expression.expression.query };
    }
    return { type: 'expression', expression };
  }

  if (value instanceof KnexSubqueryBuilder) {
    return { type: 'subquery', query: value };
  }

  return { type: 'value', value };
}

function applyWhereExpressions(
  query: Knex.QueryBuilder,
  expressions: readonly ExpressionNode[],
  context: ExpressionCompileContext,
): void {
  for (const expression of expressions) {
    applyExpressionNode(query, expression, context);
  }
}

function applySelections(
  query: Knex.QueryBuilder,
  selections: readonly SelectItem[],
  context: ExpressionCompileContext,
): ResultMap {
  const resultMap: ResultMap = {
    explicit: new Map(),
    mapUnmatchedColumns: selections.length === 0,
  };

  if (selections.length === 0) {
    return resultMap;
  }

  for (const selection of selections) {
    if (selection.type === 'all') {
      resultMap.mapUnmatchedColumns = true;
      query.select(
        selection.table
          ? `${mapTableQualifier(
              selection.table,
              context.naming,
              context.tableScope,
            )}.*`
          : '*',
      );
      continue;
    }

    applySelectionExpression(query, selection.selection, context, resultMap);
  }

  return resultMap;
}

function applySelectionExpression(
  query: Knex.QueryBuilder,
  selection: SelectionExpression,
  context: ExpressionCompileContext,
  resultMap: ResultMap,
): void {
  if (typeof selection === 'string') {
    const mapped = mapStringSelection(
      selection,
      context.naming,
      context.tableScope,
    );
    if (mapped.mapUnmatchedColumns) {
      resultMap.mapUnmatchedColumns = true;
    }
    if (mapped.result) {
      resultMap.explicit.set(mapped.result.physical, mapped.result.logical);
    }
    query.select(mapped.selection as any);
    return;
  }

  const node = getExpressionNode(selection);
  if (node.type !== 'aliasedExpression') {
    query.select(expressionNodeToRaw(context, node) as any);
    return;
  }

  const logicalAlias = node.alias;
  const physicalAlias = mapIdentifier(logicalAlias, context.naming);
  resultMap.explicit.set(physicalAlias, logicalAlias);
  query.select(
    expressionNodeToSelectRaw(context, node.expression, physicalAlias) as any,
  );
}

function applyExpressionNode(
  query: Knex.QueryBuilder,
  expression: ExpressionNode,
  context: ExpressionCompileContext,
  bool: 'and' | 'or' = 'and',
): void {
  switch (expression.type) {
    case 'binary':
      applyBinaryExpression(query, expression, context, bool);
      break;
    case 'and':
      applyExpressionGroup(query, expression.expressions, context, bool, 'and');
      break;
    case 'or':
      applyExpressionGroup(query, expression.expressions, context, bool, 'or');
      break;
    case 'not':
      applyNotExpression(query, expression.expression, context, bool);
      break;
    case 'between':
      applyBetweenExpression(query, expression, context, bool, false);
      break;
    case 'exists':
      applyExistsExpression(query, expression, context, bool, false);
      break;
    case 'parens':
      applyExpressionGroup(
        query,
        [expression.expression],
        context,
        bool,
        'and',
      );
      break;
    case 'ref':
    case 'val':
    case 'aggregate':
    case 'subquery':
    case 'aliasedExpression':
      throw new Error(
        `Expression "${expression.type}" cannot be used directly as a condition.`,
      );
    default:
      assertNever(expression);
  }
}

function applyExpressionGroup(
  query: Knex.QueryBuilder,
  expressions: readonly ExpressionNode[],
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  groupBool: 'and' | 'or',
): void {
  if (expressions.length === 0) {
    return;
  }

  const method =
    context.clause === 'having'
      ? bool === 'or'
        ? 'orHaving'
        : 'having'
      : bool === 'or'
        ? 'orWhere'
        : 'where';
  (query as any)[method](function group(this: Knex.QueryBuilder) {
    expressions.forEach((expression, index) => {
      applyExpressionNode(
        this,
        expression,
        context,
        groupBool === 'or' && index > 0 ? 'or' : 'and',
      );
    });
  });
}

function applyNotExpression(
  query: Knex.QueryBuilder,
  expression: ExpressionNode,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
): void {
  if (expression.type === 'between') {
    applyBetweenExpression(query, expression, context, bool, true);
    return;
  }
  if (expression.type === 'exists') {
    applyExistsExpression(query, expression, context, bool, true);
    return;
  }
  if (expression.type === 'binary') {
    applyBinaryExpression(
      query,
      {
        ...expression,
        op: invertComparisonOperator(expression.op),
      },
      context,
      bool,
    );
    return;
  }

  const method =
    context.clause === 'having'
      ? bool === 'or'
        ? 'orHavingNot'
        : 'havingNot'
      : bool === 'or'
        ? 'orWhereNot'
        : 'whereNot';
  (query as any)[method](function notGroup(this: Knex.QueryBuilder) {
    applyExpressionNode(this, expression, context);
  });
}

function applyBinaryExpression(
  query: Knex.QueryBuilder,
  expression: Extract<ExpressionNode, { type: 'binary' }>,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
): void {
  const lhs = compileOperand(context, expression.lhs);
  const op = expression.op;
  const rhs = expression.rhs;

  if (rhs.type === 'ref') {
    callColumnComparison(
      query,
      context,
      bool,
      lhs,
      op,
      mapReference(rhs.reference, context.naming, context.tableScope),
    );
    return;
  }

  if (rhs.type === 'subquery') {
    callSubqueryComparison(
      query,
      context,
      bool,
      lhs,
      op,
      rhs.query.buildQuery(context.client, context.tableScope),
    );
    return;
  }

  if (rhs.type === 'expression') {
    callBasicComparison(
      query,
      context,
      bool,
      lhs,
      op,
      expressionNodeToRaw(context, rhs.expression),
    );
    return;
  }

  callValueComparison(query, context, bool, lhs, op, rhs.value);
}

function applyBetweenExpression(
  query: Knex.QueryBuilder,
  expression: Extract<ExpressionNode, { type: 'between' }>,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  not: boolean,
): void {
  const lhs = compileOperand(context, expression.expression);
  const method =
    context.clause === 'having'
      ? not
        ? 'havingNotBetween'
        : 'havingBetween'
      : not
        ? 'whereNotBetween'
        : 'whereBetween';
  callBooleanMethod(query, bool, method, lhs, [
    expression.start,
    expression.end,
  ]);
}

function applyExistsExpression(
  query: Knex.QueryBuilder,
  expression: Extract<ExpressionNode, { type: 'exists' }>,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  not: boolean,
): void {
  const method =
    context.clause === 'having'
      ? not
        ? 'havingNotExists'
        : 'havingExists'
      : not
        ? 'whereNotExists'
        : 'whereExists';
  callBooleanMethod(
    query,
    bool,
    method,
    expression.query.buildQuery(context.client, context.tableScope),
  );
}

function callSubqueryComparison(
  query: Knex.QueryBuilder,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  lhs: string | Knex.Raw,
  op: ComparisonOperator,
  subquery: Knex.QueryBuilder,
): void {
  switch (op) {
    case 'in':
      callBooleanMethod(
        query,
        bool,
        context.clause === 'having' ? 'havingIn' : 'whereIn',
        lhs,
        subquery,
      );
      break;
    case 'not in':
      callBooleanMethod(
        query,
        bool,
        context.clause === 'having' ? 'havingNotIn' : 'whereNotIn',
        lhs,
        subquery,
      );
      break;
    default:
      callBasicComparison(query, context, bool, lhs, op, subquery);
      break;
  }
}

function callValueComparison(
  query: Knex.QueryBuilder,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  lhs: string | Knex.Raw,
  op: ComparisonOperator,
  value: unknown,
): void {
  switch (op) {
    case 'in':
      callBooleanMethod(
        query,
        bool,
        context.clause === 'having' ? 'havingIn' : 'whereIn',
        lhs,
        value,
      );
      break;
    case 'not in':
      callBooleanMethod(
        query,
        bool,
        context.clause === 'having' ? 'havingNotIn' : 'whereNotIn',
        lhs,
        value,
      );
      break;
    case 'is':
      if (value === null) {
        callBooleanMethod(
          query,
          bool,
          context.clause === 'having' ? 'havingNull' : 'whereNull',
          lhs,
        );
      } else {
        callBasicComparison(query, context, bool, lhs, '=', value);
      }
      break;
    case 'is not':
      if (value === null) {
        callBooleanMethod(
          query,
          bool,
          context.clause === 'having' ? 'havingNotNull' : 'whereNotNull',
          lhs,
        );
      } else {
        callBasicComparison(query, context, bool, lhs, '!=', value);
      }
      break;
    default:
      callBasicComparison(query, context, bool, lhs, op, value);
      break;
  }
}

function callBasicComparison(
  query: Knex.QueryBuilder,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  lhs: string | Knex.Raw,
  op: ComparisonOperator,
  rhs: unknown,
): void {
  const method =
    context.clause === 'having'
      ? bool === 'or'
        ? 'orHaving'
        : 'having'
      : bool === 'or'
        ? 'orWhere'
        : 'where';
  (query as any)[method](lhs, op, rhs);
}

function callColumnComparison(
  query: Knex.QueryBuilder,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  lhs: string | Knex.Raw,
  op: ComparisonOperator,
  rhs: string,
): void {
  if (context.clause === 'where' && typeof lhs === 'string') {
    const method = bool === 'or' ? 'orWhereColumn' : 'whereColumn';
    (query as any)[method](lhs, op, rhs);
    return;
  }

  const lhsSql = typeof lhs === 'string' ? '??' : '?';
  const bindings = typeof lhs === 'string' ? [lhs, rhs] : [lhs, rhs];
  const method =
    context.clause === 'having'
      ? bool === 'or'
        ? 'orHavingRaw'
        : 'havingRaw'
      : bool === 'or'
        ? 'orWhereRaw'
        : 'whereRaw';
  (query as any)[method](`${lhsSql} ${op} ??`, bindings);
}

function callBooleanMethod(
  query: Knex.QueryBuilder,
  bool: 'and' | 'or',
  method: string,
  ...args: unknown[]
): void {
  const methodName =
    bool === 'or' ? `or${method[0]?.toUpperCase()}${method.slice(1)}` : method;
  (query as any)[methodName](...args);
}

function applyJoin(
  query: Knex.QueryBuilder,
  join: JoinItem,
  context: ExpressionCompileContext,
): void {
  const table = mapTableSourceExpression(join.table, context.naming);
  if (join.type === 'cross') {
    (query as any).crossJoin(table);
    return;
  }

  const method = `${join.type}Join`;
  (query as any)[method](table, function joinClause(this: Knex.JoinClause) {
    for (const condition of join.conditions) {
      applyJoinExpressionNode(this, condition, context);
    }
  });
}

function applyJoinExpressionNode(
  clause: Knex.JoinClause,
  expression: ExpressionNode,
  context: ExpressionCompileContext,
  bool: 'and' | 'or' = 'and',
): void {
  switch (expression.type) {
    case 'binary':
      applyJoinBinaryExpression(clause, expression, context, bool);
      break;
    case 'and':
      applyJoinExpressionGroup(
        clause,
        expression.expressions,
        context,
        bool,
        'and',
      );
      break;
    case 'or':
      applyJoinExpressionGroup(
        clause,
        expression.expressions,
        context,
        bool,
        'or',
      );
      break;
    case 'not':
      applyJoinNotExpression(clause, expression.expression, context, bool);
      break;
    case 'between':
      applyJoinBetweenExpression(clause, expression, context, bool, false);
      break;
    case 'exists':
      applyJoinExistsExpression(clause, expression, context, bool, false);
      break;
    case 'parens':
      applyJoinExpressionGroup(
        clause,
        [expression.expression],
        context,
        bool,
        'and',
      );
      break;
    case 'ref':
    case 'val':
    case 'aggregate':
    case 'subquery':
    case 'aliasedExpression':
      throw new Error(
        `Expression "${expression.type}" cannot be used directly as a join condition.`,
      );
    default:
      assertNever(expression);
  }
}

function applyJoinExpressionGroup(
  clause: Knex.JoinClause,
  expressions: readonly ExpressionNode[],
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  groupBool: 'and' | 'or',
): void {
  if (expressions.length === 0) {
    return;
  }

  callJoinMethod(clause, bool, 'on', function group(this: Knex.JoinClause) {
    expressions.forEach((expression, index) => {
      applyJoinExpressionNode(
        this,
        expression,
        context,
        groupBool === 'or' && index > 0 ? 'or' : 'and',
      );
    });
  });
}

function applyJoinNotExpression(
  clause: Knex.JoinClause,
  expression: ExpressionNode,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
): void {
  if (expression.type === 'between') {
    applyJoinBetweenExpression(clause, expression, context, bool, true);
    return;
  }
  if (expression.type === 'exists') {
    applyJoinExistsExpression(clause, expression, context, bool, true);
    return;
  }
  if (expression.type === 'binary') {
    applyJoinBinaryExpression(
      clause,
      {
        ...expression,
        op: invertComparisonOperator(expression.op),
      },
      context,
      bool,
    );
    return;
  }

  callJoinMethod(
    clause,
    bool,
    'on',
    context.client.raw('not (?)', [
      expressionNodeToConditionRaw(context, expression),
    ] as any),
  );
}

function applyJoinBinaryExpression(
  clause: Knex.JoinClause,
  expression: Extract<ExpressionNode, { type: 'binary' }>,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
): void {
  const lhs = compileOperand(context, expression.lhs);
  const rhs = expression.rhs;
  const op = expression.op;

  if (rhs.type === 'ref') {
    callJoinMethod(
      clause,
      bool,
      'on',
      lhs,
      op,
      mapReference(rhs.reference, context.naming, context.tableScope),
    );
    return;
  }

  if (rhs.type === 'value') {
    applyJoinValueComparison(clause, context, bool, lhs, op, rhs.value);
    return;
  }

  if (rhs.type === 'subquery') {
    callJoinMethod(
      clause,
      bool,
      'on',
      lhs,
      op,
      context.client.raw('(?)', [
        rhs.query.buildQuery(context.client, context.tableScope),
      ] as any),
    );
    return;
  }

  callJoinMethod(
    clause,
    bool,
    'on',
    lhs,
    op,
    expressionNodeToRaw(context, rhs.expression),
  );
}

function applyJoinValueComparison(
  clause: Knex.JoinClause,
  _context: ExpressionCompileContext,
  bool: 'and' | 'or',
  lhs: string | Knex.Raw,
  op: ComparisonOperator,
  value: unknown,
): void {
  switch (op) {
    case 'in':
      callJoinMethod(clause, bool, 'onIn', lhs, value);
      break;
    case 'not in':
      callJoinMethod(clause, bool, 'onNotIn', lhs, value);
      break;
    case 'is':
      if (value === null) {
        callJoinMethod(clause, bool, 'onNull', lhs);
      } else {
        callJoinMethod(clause, bool, 'onVal', lhs, '=', value);
      }
      break;
    case 'is not':
      if (value === null) {
        callJoinMethod(clause, bool, 'onNotNull', lhs);
      } else {
        callJoinMethod(clause, bool, 'onVal', lhs, '!=', value);
      }
      break;
    default:
      callJoinMethod(clause, bool, 'onVal', lhs, op, value);
      break;
  }
}

function applyJoinBetweenExpression(
  clause: Knex.JoinClause,
  expression: Extract<ExpressionNode, { type: 'between' }>,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  not: boolean,
): void {
  const lhs = compileOperand(context, expression.expression);
  callJoinMethod(clause, bool, not ? 'onNotBetween' : 'onBetween', lhs, [
    expression.start,
    expression.end,
  ]);
}

function applyJoinExistsExpression(
  clause: Knex.JoinClause,
  expression: Extract<ExpressionNode, { type: 'exists' }>,
  context: ExpressionCompileContext,
  bool: 'and' | 'or',
  not: boolean,
): void {
  callJoinMethod(
    clause,
    bool,
    'on',
    context.client.raw(`${not ? 'not ' : ''}exists (?)`, [
      expression.query.buildQuery(context.client, context.tableScope),
    ] as any),
  );
}

function callJoinMethod(
  clause: Knex.JoinClause,
  bool: 'and' | 'or',
  method: string,
  ...args: unknown[]
): void {
  const methodName =
    bool === 'or' ? `or${method[0]?.toUpperCase()}${method.slice(1)}` : method;
  (clause as any)[methodName](...args);
}

function expressionNodeToConditionRaw(
  context: ExpressionCompileContext,
  expression: ExpressionNode,
): Knex.Raw {
  const query = context.client.queryBuilder();
  applyExpressionNode(query, expression, {
    ...context,
    clause: 'where',
  });
  const compiled = query.toSQL();
  const whereIndex = compiled.sql.toLowerCase().indexOf(' where ');
  if (whereIndex === -1) {
    throw new Error('Unable to compile query expression.');
  }
  return context.client.raw(
    compiled.sql.slice(whereIndex + ' where '.length),
    compiled.bindings as any,
  );
}

function compileOperand(
  context: ExpressionCompileContext,
  operand: OperandNode,
): string | Knex.Raw {
  switch (operand.type) {
    case 'ref':
      return mapReference(
        operand.reference,
        context.naming,
        context.tableScope,
      );
    case 'expression':
      return expressionNodeToRaw(context, operand.expression);
    case 'value':
    case 'subquery':
      throw new Error(
        `Operand "${operand.type}" cannot be used on the left side of a comparison.`,
      );
    default:
      return assertNever(operand);
  }
}

function expressionNodeToRaw(
  context: ExpressionCompileContext,
  expression: ExpressionNode,
): Knex.Raw {
  switch (expression.type) {
    case 'ref':
      return context.client.ref(
        mapReference(expression.reference, context.naming, context.tableScope),
      );
    case 'val':
      return context.client.raw('?', [expression.value] as any);
    case 'aggregate':
      return aggregateNodeToRaw(context, expression);
    case 'subquery':
      return context.client.raw('(?)', [
        expression.query.buildQuery(context.client, context.tableScope),
      ] as any);
    case 'parens':
      return context.client.raw('(?)', [
        expressionNodeToRaw(context, expression.expression),
      ] as any);
    default:
      throw new Error(
        `Expression "${expression.type}" cannot be used as a value operand.`,
      );
  }
}

function expressionNodeToSelectRaw(
  context: ExpressionCompileContext,
  expression: ExpressionNode,
  physicalAlias: string,
): Knex.Raw {
  if (expression.type === 'aggregate') {
    return aggregateNodeToRaw(context, expression, physicalAlias);
  }
  if (expression.type === 'subquery') {
    return context.client.raw('(?) as ??', [
      expression.query.buildQuery(context.client, context.tableScope),
      physicalAlias,
    ] as any);
  }
  return context.client.raw('? as ??', [
    expressionNodeToRaw(context, expression),
    physicalAlias,
  ] as any);
}

function aggregateNodeToRaw(
  context: ExpressionCompileContext,
  expression: Extract<ExpressionNode, { type: 'aggregate' }>,
  physicalAlias?: string,
): Knex.Raw {
  const fn = expression.fn === 'countAll' ? 'count' : expression.fn;
  const bindings: unknown[] = [];
  let sql: string;

  if (expression.fn === 'countAll') {
    sql = `${fn}(*)`;
  } else {
    const operand = expression.operand;
    if (!operand || operand.type !== 'ref') {
      throw new Error(`${expression.fn}() expects a column reference.`);
    }
    const castMssqlAverage =
      expression.fn === 'avg' &&
      context.client.client.config.client === 'mssql';
    sql = castMssqlAverage
      ? `${fn}(${expression.distinct ? 'distinct ' : ''}cast(?? as float))`
      : `${fn}(${expression.distinct ? 'distinct ' : ''}??)`;
    bindings.push(
      mapReference(operand.reference, context.naming, context.tableScope),
    );
  }

  if (physicalAlias) {
    sql = `${sql} as ??`;
    bindings.push(physicalAlias);
  }

  return context.client.raw(sql, bindings as any);
}

function normalizeSelectionInput(
  input:
    SelectionExpression | readonly SelectionExpression[] | SelectionFactory,
  builder: ExpressionBuilder,
): SelectionExpression[] {
  if (typeof input === 'function' && !isExpression(input)) {
    return [...input(builder)];
  }
  if (Array.isArray(input)) {
    return [...input];
  }
  return [input as SelectionExpression];
}

function normalizeStringList(input: string | readonly string[]): string[] {
  return typeof input === 'string' ? [input] : [...input];
}

function mapStringSelection(
  selection: string,
  naming: NamingStrategy,
  tableScope: TableScope,
): {
  selection: unknown;
  result?: { physical: string; logical: string };
  mapUnmatchedColumns?: boolean;
} {
  if (selection === '*') {
    return { selection: '*', mapUnmatchedColumns: true };
  }

  if (selection.endsWith('.*')) {
    return {
      selection: `${mapTableQualifier(
        selection.slice(0, -2),
        naming,
        tableScope,
      )}.*`,
      mapUnmatchedColumns: true,
    };
  }

  const parsed = parseAliasedIdentifier(selection);
  const physicalReference = mapReference(parsed.identifier, naming, tableScope);
  const logicalAlias = parsed.alias ?? lastReferenceSegment(parsed.identifier);
  const physicalAlias = mapIdentifier(logicalAlias, naming);

  return {
    selection: { [physicalAlias]: physicalReference },
    result: {
      physical: physicalAlias,
      logical: logicalAlias,
    },
  };
}

function logicalResultKeyForSelection(selection: string): string {
  const parsed = parseAliasedIdentifier(selection);
  return parsed.alias ?? lastReferenceSegment(parsed.identifier);
}

function resolveTableSource(
  tableExpression: string,
  naming: NamingStrategy,
): ResolvedTableSource {
  const parsed = parseAliasedIdentifier(tableExpression);
  if (parsed.identifier.includes('.')) {
    throw new Error(
      'Query table sources do not support schema-qualified identifiers. Use connection.client() for physical schema access.',
    );
  }
  const physicalTable = naming.collectionToTableName(parsed.identifier);
  const physicalAlias = parsed.alias
    ? mapIdentifier(parsed.alias, naming)
    : undefined;

  return {
    sql: physicalAlias ? `${physicalTable} as ${physicalAlias}` : physicalTable,
    logicalQualifier: parsed.alias ?? parsed.identifier,
    sqlQualifier: physicalAlias ?? physicalTable,
  };
}

function mapTableSourceExpression(
  tableExpression: string,
  naming: NamingStrategy,
): string {
  return resolveTableSource(tableExpression, naming).sql;
}

function createTableScope(
  tableExpressions: readonly string[],
  naming: NamingStrategy,
  parent?: TableScope,
): TableScope {
  const qualifiers = new Map<string, string>();

  for (const expression of tableExpressions) {
    const source = resolveTableSource(expression, naming);
    qualifiers.set(source.logicalQualifier, source.sqlQualifier);
    qualifiers.set(
      mapIdentifier(source.logicalQualifier, naming),
      source.sqlQualifier,
    );
  }

  return { qualifiers, parent };
}

function resolveTableQualifier(
  qualifier: string,
  scope: TableScope | undefined,
): string | undefined {
  let current = scope;
  while (current) {
    const resolved = current.qualifiers.get(qualifier);
    if (resolved !== undefined) {
      return resolved;
    }
    current = current.parent;
  }
  return undefined;
}

function mapTableQualifier(
  qualifier: string,
  naming: NamingStrategy,
  scope: TableScope,
): string {
  return (
    resolveTableQualifier(qualifier, scope) ?? mapIdentifier(qualifier, naming)
  );
}

function mapReference(
  reference: string,
  naming: NamingStrategy,
  tableScope?: TableScope,
): string {
  if (reference === '*') {
    return reference;
  }

  const parts = reference.split('.');
  const qualifier =
    parts.length > 1 ? resolveTableQualifier(parts[0], tableScope) : undefined;

  return parts
    .map((part, index) => {
      if (part === '*') {
        return part;
      }
      if (index === 0 && qualifier !== undefined) {
        return qualifier;
      }
      return mapIdentifier(part, naming);
    })
    .join('.');
}

function mapIdentifier(identifier: string, naming: NamingStrategy): string {
  return naming.fieldToColumnName(identifier);
}

function mapData(
  data: Row | readonly Row[],
  naming: NamingStrategy,
): Row | Row[] {
  if (Array.isArray(data)) {
    return data.map((item) => mapData(item, naming) as Row);
  }
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      mapIdentifier(key, naming),
      value,
    ]),
  );
}

function parseAliasedIdentifier(value: string): {
  identifier: string;
  alias?: string;
} {
  const trimmed = value.trim();
  const asMatch = trimmed.match(/^(.+?)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
  if (asMatch) {
    return {
      identifier: asMatch[1].trim(),
      alias: asMatch[2].trim(),
    };
  }

  return { identifier: trimmed };
}

function mapResultRow(
  row: Row,
  resultMap: ResultMap,
  naming: NamingStrategy,
): Row {
  const shouldCamelCaseUnmatched =
    resultMap.mapUnmatchedColumns && isUnderscoredNaming(naming);
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      resultMap.explicit.get(key) ??
        (shouldCamelCaseUnmatched ? camelCase(key) : key),
      value,
    ]),
  );
}

function normalizeRows(rows: unknown): Row[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows as Row[];
}

function normalizeComparisonOperator(
  operator: ComparisonOperator,
): ComparisonOperator {
  const normalized = operator.toLowerCase().trim() as ComparisonOperator;
  switch (normalized) {
    case '=':
    case '!=':
    case '<>':
    case '>':
    case '>=':
    case '<':
    case '<=':
    case 'in':
    case 'not in':
    case 'is':
    case 'is not':
    case 'like':
    case 'not like':
      return normalized;
    default:
      throw new Error(
        `Unsupported portable comparison operator "${operator}".`,
      );
  }
}

function invertComparisonOperator(
  operator: ComparisonOperator,
): ComparisonOperator {
  switch (operator) {
    case '=':
      return '!=';
    case '!=':
    case '<>':
      return '=';
    case '>':
      return '<=';
    case '>=':
      return '<';
    case '<':
      return '>=';
    case '<=':
      return '>';
    case 'in':
      return 'not in';
    case 'not in':
      return 'in';
    case 'is':
      return 'is not';
    case 'is not':
      return 'is';
    case 'like':
      return 'not like';
    case 'not like':
      return 'like';
    default:
      return assertNever(operator);
  }
}

function normalizeInsertResult(
  result: unknown,
  data: Row | readonly Row[],
): InsertResult {
  const insertedCount = Array.isArray(data) ? data.length : 1;
  if (Array.isArray(result)) {
    if (result.every(isPlainObject)) {
      return { insertedCount, rows: result };
    }
    return { insertedCount, insertId: result[0] };
  }
  return { insertedCount, insertId: result };
}

function normalizeUpdateResult(result: unknown): UpdateResult {
  if (Array.isArray(result)) {
    if (result.every(isPlainObject)) {
      return { updatedCount: result.length, rows: result };
    }
    return { updatedCount: result.length };
  }
  if (typeof result === 'number') {
    return { updatedCount: result };
  }
  return {};
}

function normalizeDeleteResult(result: unknown): DeleteResult {
  if (Array.isArray(result)) {
    if (result.every(isPlainObject)) {
      return { deletedCount: result.length, rows: result };
    }
    return { deletedCount: result.length };
  }
  if (typeof result === 'number') {
    return { deletedCount: result };
  }
  return {};
}

function isPlainObject(value: unknown): value is Row {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertRightJoinReference(
  reference: ReferenceExpression | undefined,
): ReferenceExpression {
  if (reference === undefined) {
    throw new Error(
      'join() expects either a callback or (table, leftRef, rightRef).',
    );
  }
  return reference;
}

function isUnderscoredNaming(naming: NamingStrategy): boolean {
  return naming.fieldToColumnName('createdAt') === 'created_at';
}

function camelCase(value: string): string {
  return value.replace(/_([a-z0-9])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function lastReferenceSegment(reference: string): string {
  return reference.split('.').at(-1) ?? reference;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
