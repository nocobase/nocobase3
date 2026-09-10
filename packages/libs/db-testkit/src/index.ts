import type { DatabaseManager } from '@nocobase/db';

/**
 * The smallest context a shared database contract needs.
 * Dialect packages add their connection and cleanup details in the adapter.
 */
export interface DatabaseContractContext {
  database: DatabaseManager;
  table(name: string): string;
  identifier(name: string): string;
  cleanup(): Promise<void>;
}

export type DatabaseContractFactory<TContext extends DatabaseContractContext> =
  () => TContext | Promise<TContext>;

export interface DatabaseContractSuiteOptions<
  TContext extends DatabaseContractContext,
> {
  createContext: DatabaseContractFactory<TContext>;
  title?: string;
}

/**
 * Define a reusable contract without importing a concrete dialect.
 *
 * The callback receives a factory rather than a live context so the caller can
 * decide how Vitest lifecycle hooks, connection pooling, and cleanup should be
 * managed by its dialect adapter.
 */
export function defineDatabaseContractSuite<
  TContext extends DatabaseContractContext,
>(
  options: DatabaseContractSuiteOptions<TContext>,
  define: (createContext: DatabaseContractFactory<TContext>) => void,
): void {
  define(options.createContext);
}
