export * from './config.js';
export * from './connection.js';
export * from './factory.js';
export * from './manager.js';
export * from './schema-management.js';
export * from './token.js';
export * from './capabilities.js';
export * from './drivers/knex/index.js';

export { KnexQueryAdapter } from '../query/index.js';
export type {
  AliasedExpression,
  AggregateExpression,
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
  OperandValueExpressionOrList,
  OrderDirection,
  PortableComparisonOperator,
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
} from '../query/index.js';
