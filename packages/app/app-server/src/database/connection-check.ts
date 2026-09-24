import type { AppPaths } from '../config/index.js';
import { createAppDatabaseManager } from './manager.js';
import type { AppDatabaseConfig } from './types.js';

export type ConnectionCheckStatus = 'ok' | 'failed' | 'skipped';

export interface ConnectionCheckResult {
  readonly name: string;
  readonly dialect: string;
  readonly status: ConnectionCheckStatus;
  /** Why the connection failed, or why it was not tried. Never carries credentials. */
  readonly reason?: string;
}

export interface CheckConnectionsOptions {
  /** Connections to try; the rest are reported as skipped. Defaults to every configured connection. */
  readonly include?: (name: string, dialect: string) => boolean;
  readonly timeoutMs?: number;
}

/** The part of a knex instance this needs. Structural, so this package does not depend on knex for one call. */
interface PooledClient {
  readonly client: {
    acquireConnection(): Promise<unknown>;
    releaseConnection(connection: unknown): Promise<unknown>;
  };
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Opens one connection per configured database and hands it straight back.
 *
 * Taking a connection from the pool is what proves the address, port, credentials and database name are right, and it
 * needs no SQL — a probe query would have to be spelled differently for Oracle and Dameng than for everything else.
 * `DatabaseConnection.connect()` is deliberately not used: it also loads the collection registry, which reads metadata
 * tables and so reports a fresh database that has not been migrated yet as broken.
 */
export async function checkConnections(
  database: AppDatabaseConfig,
  paths: AppPaths,
  options: CheckConnectionsOptions = {},
): Promise<readonly ConnectionCheckResult[]> {
  const entries = Object.entries(database.connections ?? {});
  const manager = createAppDatabaseManager(database, paths);
  if (manager === undefined) return [];

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const results: ConnectionCheckResult[] = [];
  try {
    for (const [name, connection] of entries) {
      const dialect = String(connection.dialect);
      if (options.include && !options.include(name, dialect)) {
        results.push({ name, dialect, status: 'skipped' });
        continue;
      }
      try {
        const knex = await manager.connection(name).client<PooledClient>();
        const acquired = await withTimeout(
          knex.client.acquireConnection(),
          timeoutMs,
          `No connection within ${timeoutMs / 1000}s.`,
        );
        await knex.client.releaseConnection(acquired);
        results.push({ name, dialect, status: 'ok' });
      } catch (error) {
        results.push({
          name,
          dialect,
          status: 'failed',
          reason: describe(error),
        });
      }
    }
  } finally {
    await manager.destroy();
  }
  return results;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The driver's own message is the useful part — "password authentication failed", "ECONNREFUSED" — and drivers do not
 * put the password in it. A pool timeout wraps the real cause, so that is unwrapped when present.
 */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  return cause instanceof Error && cause.message !== ''
    ? `${error.message} ${cause.message}`
    : error.message;
}
