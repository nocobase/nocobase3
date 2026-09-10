import type { Knex } from 'knex';
import type { DatabaseCapabilities } from '../schema/adapter.js';
import type { ConnectionConfig } from './config.js';
import type { KnexConnectionConfig } from './internal/knex/config.js';

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
}

export interface DatabaseQueryRuntimeStrategy {
  readonly [key: string]: unknown;
}

export interface DatabaseRepositoryRuntimeStrategy {
  readonly [key: string]: unknown;
}

export interface DatabaseSchemaRuntimeStrategy {
  readonly [key: string]: unknown;
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
