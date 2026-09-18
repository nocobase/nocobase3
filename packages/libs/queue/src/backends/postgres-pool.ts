import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const RESOURCE_CLEANUP_TIMEOUT_MS = 5000;

export function isBorrowedPostgresPool(value: unknown): value is Pool {
  if (typeof value !== 'object' || value === null || !('connect' in value))
    return false;
  const pg = require('pg') as typeof import('pg');
  if (
    !(value instanceof pg.Pool) ||
    Object.getPrototypeOf(value) !== pg.Pool.prototype ||
    value.connect !== pg.Pool.prototype.connect ||
    value.query !== pg.Pool.prototype.query
  )
    throw new TypeError('Only an unmodified standard pg.Pool is supported');
  // pg-pool constructs this effective constructor, not options.Client. Check
  // both surfaces: callers can replace Client after creating a standard Pool.
  if (!('Client' in value) || value.Client !== pg.Client)
    throw new TypeError('Only the standard pg.Client is supported');
  for (const key of ['onConnect', 'verify', 'Client'] as const) {
    if (key in value.options && value.options[key] !== undefined)
      throw new TypeError(`Unsupported Pool option: ${key}`);
  }
  return true;
}
import type { Pool, PoolClient, QueryConfig } from 'pg';
import type {
  PgPool,
  PgPoolClient,
  PgQueryResult,
  PgNotification,
} from 'bullmq';

export const postgresDeadline: AsyncLocalStorage<number> =
  new AsyncLocalStorage<number>();

export interface BorrowedPostgresPool {
  pool: PgPool;
  close(): Promise<void>;
}

/** Adapts acquired leases only; never mutates or ends the caller's Pool. */
export function createBorrowedPostgresPool(
  owner: Pool,
  migration: boolean = false,
): BorrowedPostgresPool {
  const leases = new Set<Lease>();
  const retiring = new Set<Promise<void>>();
  const acquisitions = new Set<Promise<PgPoolClient>>();
  let closed = false;
  const remaining = (end: number): number => {
    const value = Math.floor(end - performance.now());
    if (value <= 0) throw new Error('PostgreSQL operation deadline exceeded');
    return value;
  };
  class Lease extends EventEmitter implements PgPoolClient {
    released = false;
    ended = false;
    serial: Promise<void> = Promise.resolve();
    constructor(readonly raw: PoolClient) {
      super();
      raw.on('error', this.forwardError);
      raw.on('notification', this.forwardNotification);
      raw.once('end', this.forwardEnd);
    }
    forwardError = (error: Error): void => {
      if (this.listenerCount('error')) this.emit('error', error);
    };
    forwardNotification = (message: PgNotification): void => {
      this.emit('notification', message);
    };
    forwardEnd = (): void => {
      this.ended = true;
      this.raw.off('error', this.forwardError);
      this.raw.off('notification', this.forwardNotification);
      this.emit('end');
    };
    release(): void {
      if (this.released) return;
      this.released = true;
      leases.delete(this);
      if (this.ended) {
        this.raw.release(true);
        return;
      }
      const ended = new Promise<void>((resolve) =>
        this.raw.once('end', () => {
          this.raw.off('error', this.forwardError);
          this.raw.off('notification', this.forwardNotification);
          retiring.delete(ended);
          resolve();
        }),
      );
      retiring.add(ended);
      this.raw.release(true);
    }
    query<R>(
      text: string,
      params?: readonly unknown[],
    ): Promise<PgQueryResult<R>> {
      const rollback = migration && text === 'ROLLBACK';
      const deadline = rollback
        ? performance.now() + 1000
        : (postgresDeadline.getStore() ?? performance.now() + 10000);
      const run = async (): Promise<PgQueryResult<R>> => {
        if (this.released || closed)
          throw new Error('PostgreSQL lease is closed');
        const execute = async (
          sql: string,
          values?: readonly unknown[],
        ): Promise<PgQueryResult<R>> => {
          const config: QueryConfig & { query_timeout: number } = {
            text: sql,
            values: values ? [...values] : undefined,
            query_timeout: remaining(deadline),
          };
          const result = await this.raw.query(config);
          return result;
        };
        try {
          if (!rollback)
            await execute("SELECT set_config('statement_timeout', $1, false)", [
              `${remaining(deadline)}ms`,
            ]);
          return await execute(text, params);
        } catch (error) {
          if (!migration) this.release();
          throw error;
        }
      };
      const result = this.serial.then(run);
      this.serial = result.then(
        () => {},
        () => {},
      );
      return result;
    }
  }
  class Facade extends EventEmitter implements PgPool {
    connect(): Promise<PgPoolClient> {
      const work = (async (): Promise<PgPoolClient> => {
        if (closed) throw new Error('PostgreSQL pool adapter is closed');
        const end = postgresDeadline.getStore() ?? performance.now() + 10000;
        const timeout = owner.options.connectionTimeoutMillis;
        if (
          typeof timeout !== 'number' ||
          !Number.isSafeInteger(timeout) ||
          timeout <= 0 ||
          timeout > remaining(end)
        )
          throw new Error('PostgreSQL borrow timeout exceeds remaining budget');
        // Admission is not permanent: the caller still owns this mutable Pool.
        isBorrowedPostgresPool(owner);
        const raw = await owner.connect();
        const lease = new Lease(raw);
        leases.add(lease);
        if (closed) {
          lease.release();
          throw new Error('PostgreSQL pool adapter closed during acquisition');
        }
        return lease;
      })();
      acquisitions.add(work);
      void work.then(
        () => acquisitions.delete(work),
        () => acquisitions.delete(work),
      );
      return work;
    }
    async query<R>(
      text: string,
      params?: readonly unknown[],
    ): Promise<PgQueryResult<R>> {
      const lease = await this.connect();
      try {
        return await lease.query<R>(text, params);
      } finally {
        lease.release();
      }
    }
    async end(): Promise<void> {
      throw new Error('Cannot end a caller-owned PostgreSQL Pool');
    }
  }
  const pool = new Facade();
  const forwardError = (error: Error): void => {
    if (pool.listenerCount('error')) pool.emit('error', error);
  };
  owner.on('error', forwardError);
  let closing: Promise<void> | undefined;
  return {
    pool,
    close: (): Promise<void> =>
      (closing ??= new Promise<void>((resolve, reject) => {
        closed = true;
        // One reserve covers both pending checkouts and physical lease endings.
        // Expiry reports failure; it cannot cancel a caller-owned Pool operation.
        const timer = setTimeout(() => {
          reject(
            new Error(
              `Borrowed PostgreSQL Pool cleanup exceeded ${RESOURCE_CLEANUP_TIMEOUT_MS}ms; unresolved acquisitions: ${acquisitions.size}; leases awaiting end: ${retiring.size}; host or Pool owner action required`,
            ),
          );
        }, RESOURCE_CLEANUP_TIMEOUT_MS);
        const settle = async (): Promise<void> => {
          for (const lease of leases) lease.release();
          await Promise.allSettled(acquisitions);
          await Promise.all(retiring);
          owner.off('error', forwardError);
        };
        // Keep tracking and retiring late acquisitions after timeout. Only actual
        // settlement removes the bridge; a rejected close never becomes success.
        void settle().then(
          () => {
            clearTimeout(timer);
            resolve();
          },
          (error: unknown) => {
            clearTimeout(timer);
            reject(
              error instanceof Error
                ? error
                : new Error('Borrowed PostgreSQL Pool cleanup failed', {
                    cause: error,
                  }),
            );
          },
        );
      })),
  };
}
