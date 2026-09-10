import type {
  DatabaseContractContext,
  DatabaseContractFactory,
} from './index.js';

/**
 * Adapter boundary owned by a dialect package. The testkit only consumes this
 * shape; connection strings, native clients, cleanup and catalog queries stay
 * outside the shared package.
 */
export interface DatabaseDialectTestAdapter<
  TContext extends DatabaseContractContext = DatabaseContractContext,
> {
  createContext: DatabaseContractFactory<TContext>;
}

export function asDatabaseContractAdapter<
  TContext extends DatabaseContractContext,
>(
  adapter: DatabaseDialectTestAdapter<TContext>,
): DatabaseContractFactory<TContext> {
  return adapter.createContext;
}
