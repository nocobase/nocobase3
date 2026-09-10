import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
  createTable(name: string): Promise<void>;
  insert(table: string, values: Record<string, unknown>): Promise<void>;
  select(table: string): Promise<Array<Record<string, unknown>>>;
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
  define?: (createContext: DatabaseContractFactory<TContext>) => void,
): void {
  const defineContract =
    define ?? ((factory) => defaultDatabaseContract(factory, options.title));
  defineContract(options.createContext);
}

function defaultDatabaseContract<TContext extends DatabaseContractContext>(
  createContext: DatabaseContractFactory<TContext>,
  title = 'database contract',
): void {
  describe(title, () => {
    let context: TContext;

    beforeEach(async () => {
      context = await createContext();
    });

    afterEach(async () => {
      await context.cleanup();
    });

    it('creates a table and reads inserted rows', async () => {
      const table = context.table('contract_items');
      await context.createTable('contract_items');
      await context.insert(table, { name: 'first' });
      await expect(context.select(table)).resolves.toEqual([
        expect.objectContaining({ name: 'first' }),
      ]);
    });
  });
}
