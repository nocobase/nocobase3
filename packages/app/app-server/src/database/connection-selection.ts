import { defaultConnectionName } from './plan.js';
import type { AppDatabaseConfig } from './types.js';

export interface AppDatabaseConnectionSelection {
  /** One connection; defaults to the default connection. Exclusive with `all`. */
  readonly connection?: string;
  /** Every configured connection, external ones included. */
  readonly all?: boolean;
}

/**
 * Resolves which connections a command runs against, default connection first.
 *
 * Returns undefined when no database is configured, which callers report as
 * `not-configured` rather than as a failure — except when a connection was
 * named explicitly, since that cannot be satisfied.
 */
export function selectAppDatabaseConnections(
  config: AppDatabaseConfig,
  options: AppDatabaseConnectionSelection,
): string[] | undefined {
  if (options.connection !== undefined && options.all) {
    throw new Error('--connection and --all are mutually exclusive.');
  }
  const primary = defaultConnectionName(config);
  if (primary === 'none' || !primary) {
    if (options.connection !== undefined) {
      throw new Error('Database is not configured.');
    }
    return undefined;
  }
  const names = options.all
    ? Object.keys(config.connections).sort((a, b) =>
        a === primary ? -1 : b === primary ? 1 : a < b ? -1 : a > b ? 1 : 0,
      )
    : [options.connection ?? primary];
  for (const name of names) {
    if (!Object.hasOwn(config.connections, name)) {
      throw new Error(`Unknown database connection "${name}".`);
    }
  }
  return names;
}
