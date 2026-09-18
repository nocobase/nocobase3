import { Socket } from 'node:net';
import {
  PostgresConnection,
  runMigrations,
  assertSchemaCompatibility,
} from 'bullmq';
import type { PgQueryable, PgQueryResult, PostgresPoolConfig } from 'bullmq';
import {
  createBorrowedPostgresPool,
  isBorrowedPostgresPool,
  postgresDeadline,
} from './postgres-pool.js';

export interface PostgresMigrationResource {
  run(): Promise<void>;
  close(): Promise<void>;
}

/** Runs official migrations on a dedicated session with a server-side deadline. */
export function createPostgresMigrationResource(
  config: PostgresPoolConfig,
  deadline: number,
  migratedTargets: Set<string>,
): PostgresMigrationResource {
  const sockets = new Set<Socket>();
  let closed = false;
  const borrowed = isBorrowedPostgresPool(config.borrowedPool)
    ? createBorrowedPostgresPool(config.borrowedPool, true)
    : undefined;
  const connection = new PostgresConnection(
    borrowed?.pool ?? {
      ...config,
      migrate: false,
      stream: (): Socket => {
        if (closed) throw new Error('PostgreSQL migration resource is closed');
        const socket = new Socket();
        sockets.add(socket);
        socket.once('close', () => sockets.delete(socket));
        return socket;
      },
    },
  );
  connection.pool.on('connect', (client) => {
    // Owned clients can emit an error as well as rejecting their active query.
    client.on('error', () => {});
  });
  let running: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  return {
    run: (): Promise<void> =>
      (running ??= (async (): Promise<void> => {
        const client = await postgresDeadline.run(deadline, () =>
          connection.pool.connect(),
        );
        const failures: unknown[] = [];
        const queryable: PgQueryable = {
          async query<R>(
            text: string,
            params?: readonly unknown[],
          ): Promise<PgQueryResult<R>> {
            try {
              if (text !== 'ROLLBACK') {
                const remaining = Math.floor(deadline - performance.now());
                if (closed || remaining <= 0)
                  throw new Error('PostgreSQL migration deadline exceeded');
                await postgresDeadline.run(deadline, () =>
                  client.query(
                    "SELECT set_config('statement_timeout', $1, false)",
                    [`${remaining}ms`],
                  ),
                );
              }
              return await postgresDeadline.run(deadline, () =>
                client.query<R>(text, params),
              );
            } catch (error) {
              if (text !== 'ROLLBACK') throw error;
              // The official migrator awaits ROLLBACK before rethrowing its
              // initiating error, which can originate outside query(). Defer
              // only the rollback rejection until that error reaches our outer
              // boundary. This result never makes resource.run() succeed: the
              // actual failed rollback is retained and the lease is destroyed.
              failures.push(error);
              return { rows: [] };
            }
          },
        };
        try {
          if (borrowed) {
            const path = await queryable.query<{ path: string }>(
              "SELECT current_setting('search_path') AS path",
            );
            if (!['bullmq', '"bullmq"'].includes(path.rows[0]?.path ?? ''))
              throw new Error(
                'Borrowed PostgreSQL Pool requires dedicated search_path=bullmq',
              );
          }
          const identity = await queryable.query<{
            database: string;
            address: string | null;
            port: number | null;
            started: string;
          }>(
            'SELECT current_database() AS database, inet_server_addr()::text AS address, inet_server_port() AS port, pg_postmaster_start_time()::text AS started',
          );
          const target = identity.rows[0];
          if (!target)
            throw new Error('Missing PostgreSQL migration target identity');
          // Socket endpoints have no server address; never merge them by database name alone.
          const key =
            target.address === null
              ? undefined
              : JSON.stringify([
                  target.address,
                  target.port,
                  target.started,
                  target.database,
                  config.schema ?? 'bullmq',
                ]);
          if (key !== undefined && migratedTargets.has(key)) {
            await assertSchemaCompatibility(queryable, config.schema, {
              skipVersionCheck: config.skipVersionCheck,
            });
          } else {
            await runMigrations(queryable, config.schema, {
              skipVersionCheck: config.skipVersionCheck,
            });
          }
          if (borrowed) {
            const result = await queryable.query<{ schema: string | null }>(
              'SELECT current_schema() AS schema',
            );
            if (result.rows[0]?.schema !== 'bullmq')
              throw new Error(
                'Borrowed PostgreSQL Pool must resolve current_schema() to bullmq',
              );
          }
          if (key !== undefined) migratedTargets.add(key);
        } catch (error) {
          failures.unshift(error);
        } finally {
          try {
            client.release(true);
          } catch (error) {
            failures.push(error);
          }
        }
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1)
          throw new AggregateError(
            failures,
            'PostgreSQL migration and cleanup failed',
            { cause: failures[0] },
          );
      })()),
    close: (): Promise<void> =>
      (closing ??= (async (): Promise<void> => {
        closed = true;
        const endings = [...sockets].map(
          (socket) =>
            new Promise<void>((resolve) => socket.once('close', resolve)),
        );
        const force = setTimeout(() => {
          for (const socket of sockets) socket.destroy();
        }, 1000);
        try {
          await Promise.all([
            connection.close(),
            borrowed?.close(),
            running?.catch(() => {}),
            ...endings,
          ]);
        } finally {
          clearTimeout(force);
        }
      })()),
  };
}
