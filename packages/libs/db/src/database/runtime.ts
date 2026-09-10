import type { Knex } from 'knex';
import type { DatabaseCapabilities } from '../schema/adapter.js';
import type { ConnectionConfig } from './config.js';
import type { KnexConnectionConfig } from './internal/knex/config.js';
import type { FieldDefinition } from '../collection/types.js';
import type {
  AnyFieldDefinition,
  CollectionDefinition,
} from '../collection/types.js';
import type {
  FilterConditionNode,
  FilterValue,
  RepositoryRecord,
} from '../repository/types.js';

export type RuntimeNumericAggregate = 'count' | 'sum' | 'avg' | 'min' | 'max';

/**
 * The resolved runtime context handed to a dialect package.
 *
 * A dialect owns the behavior that varies between database engines.  The
 * context deliberately exposes the resolved Knex connection rather than
 * making dialect packages rediscover connection state from the raw config.
 */
export interface DatabaseDriverRuntimeContext {
  readonly dialect: string;
  readonly sourceConfig: ConnectionConfig;
  readonly config: KnexConnectionConfig;
  readonly capabilities: DatabaseCapabilities;
  readonly getClient: () => Knex;
  readonly resolveClient: () => Promise<Knex>;
}

/**
 * Runtime strategy container supplied by a dialect package.
 *
 * The strategy groups are intentionally optional and structurally extensible.
 * Individual migration stages can add narrowly scoped hooks without forcing
 * every dialect package to implement unrelated behavior.
 */
export interface DatabaseDriverRuntime {
  readonly dialect: string;
  readonly capabilities: DatabaseCapabilities;
  readonly query?: DatabaseQueryRuntimeStrategy;
  readonly repository?: DatabaseRepositoryRuntimeStrategy;
  readonly schema?: DatabaseSchemaRuntimeStrategy;
  readonly numeric?: DatabaseNumericRuntimeStrategy;
}

export interface DatabaseQueryRuntimeStrategy {
  readonly configureAggregateResults?: (context: {
    query: Knex.QueryBuilder;
    aliases: ReadonlySet<string>;
  }) => void;
  readonly wrapAggregateOrdering?: (context: {
    client: Knex;
    ordering: Knex.Raw;
    functionName: string;
  }) => Knex.Raw;
  readonly decimalAggregateKey?: (context: {
    client: Knex;
    value: Knex.Raw;
  }) => Knex.Raw;
  readonly [key: string]: unknown;
}

export interface DatabaseRepositoryRuntimeStrategy {
  readonly streamOptions?: (client: Knex) => object;
  readonly decodeStreamRow?: (
    row: RepositoryRecord,
  ) => Promise<RepositoryRecord> | RepositoryRecord;
  readonly groupAggregateOrder?: (context: {
    client: Knex;
    value: string | Knex.Raw;
    aggregate: string | undefined;
  }) => string | Knex.Raw;
  readonly createManyFallback?: (collection: CollectionDefinition) => boolean;
  readonly emptyInsertValue?: (context: {
    client: Knex;
    collection: CollectionDefinition;
  }) => Record<string, Knex.Raw> | undefined;
  readonly reloadReturnedDecimal?: boolean;
  readonly enumGroupKey?: (context: {
    client: Knex;
    field: string;
  }) => Knex.Raw;
  readonly numericMutation?: (context: {
    client: Knex;
    field: AnyFieldDefinition | undefined;
    name: string;
    operation: string;
    operand: unknown;
  }) => Knex.Raw | undefined;
  readonly compileFilterCondition?: (context: {
    query: Knex.QueryBuilder;
    collection: CollectionDefinition;
    node: FilterConditionNode;
    field: FieldDefinition | undefined;
    name: string;
    client: Knex | undefined;
    boolean: 'and' | 'or';
  }) => { handled: boolean; node?: FilterConditionNode };
  readonly escapeLikePattern?: (value: string) => string;
  readonly bindValue?: (context: {
    client: Knex;
    collection: CollectionDefinition;
    field: FieldDefinition;
    value: FilterValue;
  }) => unknown;
  readonly collectionAliasKeyword?: string;
  readonly limitLockedQuery?: (query: Knex.QueryBuilder, client: Knex) => void;
  readonly relationAggregateProjection?: (context: {
    client: Knex;
    value: Knex.Raw;
    aggregate: string;
  }) => Knex.Raw;
  readonly binaryExpression?: (context: {
    client: Knex;
    field: FieldDefinition | undefined;
    value: unknown;
  }) => Knex.Raw | undefined;
  readonly binaryComparison?: (context: {
    client: Knex;
    field: FieldDefinition | undefined;
    name: string;
    operator: string;
    value: unknown;
  }) => Knex.Raw | undefined;
  readonly encodeBoolean?: (
    field: FieldDefinition,
    value: unknown,
  ) => boolean | number | null;
  readonly encodeBlobNull?: (client: Knex) => Knex.Raw | undefined;
  readonly temporalBinding?: (context: {
    client: Knex;
    field: FieldDefinition;
    value: unknown;
  }) => Knex.Raw | string | null;
  readonly temporalProjection?: (context: {
    client: Knex;
    field: FieldDefinition | undefined;
    reference: string | Knex.Raw;
  }) => Knex.Raw | Knex.Ref<string, Record<string, string>>;
  readonly compileJsonCondition?: (context: {
    client: Knex;
    column: string;
    node: FilterConditionNode;
  }) => Knex.Raw;
  readonly [key: string]: unknown;
}

export interface DatabaseSchemaRuntimeStrategy {
  readonly [key: string]: unknown;
}

export interface DatabaseNumericRuntimeStrategy {
  readonly aggregateSql?: (context: {
    client: Knex;
    kind: RuntimeNumericAggregate;
    field: string;
    distinct: boolean;
    source?: FieldDefinition;
  }) => Knex.Raw;
  readonly hasNativeResults?: boolean;
  readonly aggregateProjection?: (context: {
    client: Knex;
    expression: Knex.Raw;
    source?: FieldDefinition;
  }) => Knex.Raw;
}

export type DatabaseDriverRuntimeFactory = (
  context: DatabaseDriverRuntimeContext,
) => DatabaseDriverRuntime;

export function createDefaultDatabaseDriverRuntime(
  context: DatabaseDriverRuntimeContext,
): DatabaseDriverRuntime {
  return {
    dialect: context.dialect,
    capabilities: context.capabilities,
  };
}

const runtimeByClient = new WeakMap<object, DatabaseDriverRuntime>();

export function attachDatabaseDriverRuntime(
  client: Knex,
  runtime: DatabaseDriverRuntime,
): void {
  runtimeByClient.set(client, runtime);
}

export function getDatabaseDriverRuntime(
  client: Knex,
): DatabaseDriverRuntime | undefined {
  return runtimeByClient.get(client);
}
