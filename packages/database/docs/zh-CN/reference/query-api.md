# Query API

本页列出 QueryAdapter V1 的 public API。用法说明见 [QueryAdapter 概览](../query/overview.md)。

## QueryAdapter

```ts
interface QueryAdapter {
  selectFrom<TRecord extends Row = Row>(table: string): SelectQuery<TRecord, Row>;
  insertInto<TRecord extends Row = Row>(table: string): InsertQuery<TRecord>;
  updateTable<TRecord extends Row = Row>(table: string): UpdateQuery<TRecord>;
  deleteFrom<TRecord extends Row = Row>(table: string): DeleteQuery<TRecord>;
}
```

## SelectQuery

```ts
interface SelectQuery<TRecord extends Row = Row, TResult extends Row = TRecord> {
  select(selection: SelectionExpression): SelectQuery<TRecord, Row>;
  select(selections: readonly SelectionExpression[]): SelectQuery<TRecord, Row>;
  select(factory: SelectionFactory): SelectQuery<TRecord, Row>;
  selectAll(table?: string): SelectQuery<TRecord, Row>;
  distinct(): SelectQuery<TRecord, TResult>;

  where(lhs: ReferenceExpression | Expression<unknown>, op: ComparisonOperator, rhs: OperandValueExpressionOrList): SelectQuery<TRecord, TResult>;
  where(expression: Expression<SqlBool>): SelectQuery<TRecord, TResult>;
  where(factory: ExpressionFactory<SqlBool>): SelectQuery<TRecord, TResult>;
  whereRef(lhs: ReferenceExpression, op: ComparisonOperator, rhs: ReferenceExpression): SelectQuery<TRecord, TResult>;

  innerJoin(table: string, leftRef: ReferenceExpression, rightRef: ReferenceExpression): SelectQuery<TRecord, TResult>;
  innerJoin(table: string, callback: JoinCallback): SelectQuery<TRecord, TResult>;
  leftJoin(table: string, leftRef: ReferenceExpression, rightRef: ReferenceExpression): SelectQuery<TRecord, TResult>;
  leftJoin(table: string, callback: JoinCallback): SelectQuery<TRecord, TResult>;
  rightJoin(table: string, leftRef: ReferenceExpression, rightRef: ReferenceExpression): SelectQuery<TRecord, TResult>;
  rightJoin(table: string, callback: JoinCallback): SelectQuery<TRecord, TResult>;
  crossJoin(table: string): SelectQuery<TRecord, TResult>;

  groupBy(column: string): SelectQuery<TRecord, TResult>;
  groupBy(columns: readonly string[]): SelectQuery<TRecord, TResult>;
  having(lhs: ReferenceExpression | Expression<unknown>, op: ComparisonOperator, rhs: OperandValueExpressionOrList): SelectQuery<TRecord, TResult>;
  having(expression: Expression<SqlBool>): SelectQuery<TRecord, TResult>;
  having(factory: ExpressionFactory<SqlBool>): SelectQuery<TRecord, TResult>;
  havingRef(lhs: ReferenceExpression, op: ComparisonOperator, rhs: ReferenceExpression): SelectQuery<TRecord, TResult>;

  orderBy(column: string, direction?: OrderDirection): SelectQuery<TRecord, TResult>;
  limit(count: number): SelectQuery<TRecord, TResult>;
  offset(count: number): SelectQuery<TRecord, TResult>;

  clearSelect(): SelectQuery<TRecord, Row>;
  clearWhere(): SelectQuery<TRecord, TResult>;
  clearJoins(): SelectQuery<TRecord, TResult>;
  clearGroupBy(): SelectQuery<TRecord, TResult>;
  clearHaving(): SelectQuery<TRecord, TResult>;
  clearOrderBy(): SelectQuery<TRecord, TResult>;
  clearLimit(): SelectQuery<TRecord, TResult>;
  clearOffset(): SelectQuery<TRecord, TResult>;

  execute<T = TResult>(): Promise<T[]>;
  executeTakeFirst<T = TResult>(): Promise<T | undefined>;
  executeTakeFirstOrThrow<T = TResult>(): Promise<T>;
  value<T = unknown>(column: string): Promise<T | undefined>;
  pluck<T = unknown>(column: string): Promise<T[]>;
  exists(): Promise<boolean>;
  compile(): CompiledQuery;
}
```

## InsertQuery

```ts
interface InsertQuery<TRecord extends Row = Row> {
  values(data: TRecord | readonly TRecord[]): InsertQuery<TRecord>;
  execute(): Promise<InsertResult>;
  compile(): CompiledQuery;
}
```

## UpdateQuery

```ts
interface UpdateQuery<TRecord extends Row = Row> {
  set(data: Partial<TRecord>): UpdateQuery<TRecord>;
  where(lhs: ReferenceExpression | Expression<unknown>, op: ComparisonOperator, rhs: OperandValueExpressionOrList): UpdateQuery<TRecord>;
  where(expression: Expression<SqlBool>): UpdateQuery<TRecord>;
  where(factory: ExpressionFactory<SqlBool>): UpdateQuery<TRecord>;
  whereRef(lhs: ReferenceExpression, op: ComparisonOperator, rhs: ReferenceExpression): UpdateQuery<TRecord>;
  clearWhere(): UpdateQuery<TRecord>;
  allowAllRows(): UpdateQuery<TRecord>;
  execute(): Promise<UpdateResult>;
  compile(): CompiledQuery;
}
```

## DeleteQuery

```ts
interface DeleteQuery<TRecord extends Row = Row> {
  where(lhs: ReferenceExpression | Expression<unknown>, op: ComparisonOperator, rhs: OperandValueExpressionOrList): DeleteQuery<TRecord>;
  where(expression: Expression<SqlBool>): DeleteQuery<TRecord>;
  where(factory: ExpressionFactory<SqlBool>): DeleteQuery<TRecord>;
  whereRef(lhs: ReferenceExpression, op: ComparisonOperator, rhs: ReferenceExpression): DeleteQuery<TRecord>;
  clearWhere(): DeleteQuery<TRecord>;
  allowAllRows(): DeleteQuery<TRecord>;
  execute(): Promise<DeleteResult>;
  compile(): CompiledQuery;
}
```

## ComparisonOperator

```ts
type ComparisonOperator =
  | '='
  | '!='
  | '<>'
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not in'
  | 'is'
  | 'is not'
  | 'like'
  | 'not like';
```

## ExpressionBuilder

```ts
interface ExpressionBuilder {
  (lhs: ReferenceExpression | Expression<unknown>, op: ComparisonOperator, rhs: OperandValueExpressionOrList): Expression<SqlBool>;

  readonly eb: ExpressionBuilder;
  readonly fn: FunctionModule;

  ref(reference: ReferenceExpression): Expression<unknown>;
  val(value: unknown): Expression<unknown>;
  and(expressions: readonly ExpressionInput<SqlBool>[] | Record<string, unknown>): Expression<SqlBool>;
  or(expressions: readonly ExpressionInput<SqlBool>[] | Record<string, unknown>): Expression<SqlBool>;
  not(expression: ExpressionInput<SqlBool>): Expression<SqlBool>;
  between(expr: ReferenceExpression | Expression<unknown>, start: unknown, end: unknown): Expression<SqlBool>;
  exists(query: SubqueryBuilder): Expression<SqlBool>;
  selectFrom(table: string): SubqueryBuilder;
  parens<T = unknown>(expression: ExpressionInput<T>): Expression<T>;
}
```

## JoinBuilder

```ts
interface JoinBuilder {
  on(lhs: ReferenceExpression | Expression<unknown>, op: ComparisonOperator, rhs: OperandValueExpressionOrList): JoinBuilder;
  on(expression: Expression<SqlBool>): JoinBuilder;
  on(factory: ExpressionFactory<SqlBool>): JoinBuilder;
  onRef(lhs: ReferenceExpression, op: ComparisonOperator, rhs: ReferenceExpression): JoinBuilder;
}
```

V1 对齐 Kysely，不提供 `orOn()` / `orOnRef()`。需要 OR join 条件时使用：

```ts
join.on((eb) =>
  eb.or([
    eb('o.customerId', '=', eb.ref('c.id')),
    eb('o.fallbackCustomerId', '=', eb.ref('c.id')),
  ])
);
```

## FunctionModule

```ts
interface FunctionModule {
  count<T = number>(column: ReferenceExpression | Expression<unknown>): AggregateExpression<T>;
  countAll<T = number>(table?: string): AggregateExpression<T>;
  sum<T = number>(column: ReferenceExpression | Expression<unknown>): AggregateExpression<T>;
  avg<T = number>(column: ReferenceExpression | Expression<unknown>): AggregateExpression<T>;
  min<T = unknown>(column: ReferenceExpression | Expression<unknown>): AggregateExpression<T>;
  max<T = unknown>(column: ReferenceExpression | Expression<unknown>): AggregateExpression<T>;
}
```
