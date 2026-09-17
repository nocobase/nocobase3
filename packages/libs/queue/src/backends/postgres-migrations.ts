import { Socket } from 'node:net';
import {
  PostgresConnection,
  runMigrations,
  assertSchemaCompatibility,
} from 'bullmq';
import type { PgQueryable, PgQueryResult, PostgresPoolConfig } from 'bullmq';

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
  const connection = new PostgresConnection({
    ...config,
    migrate: false,
    stream: (): Socket => {
      if (closed) throw new Error('PostgreSQL migration resource is closed');
      const socket = new Socket();
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      return socket;
    },
  });
  connection.pool.on('connect', (client) => {
    // Owned clients can emit an error as well as rejecting their active query.
    client.on('error', () => {});
  });
  let running: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  return {
    run: (): Promise<void> =>
      (running ??= (async (): Promise<void> => {
        const client = await connection.pool.connect();
        let primary: unknown;
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
                await client.query(
                  "SELECT set_config('statement_timeout', $1, false)",
                  [`${remaining}ms`],
                );
              }
              return await client.query<R>(text, params);
            } catch (error) {
              if (primary !== undefined && primary !== error)
                throw new AggregateError(
                  [primary, error],
                  'PostgreSQL migration and rollback failed',
                  { cause: error },
                );
              primary = error;
              throw error;
            }
          },
        };
        try {
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
            return;
          }
          await runMigrations(queryable, config.schema, {
            skipVersionCheck: config.skipVersionCheck,
          });
          if (key !== undefined) migratedTargets.add(key);
        } finally {
          client.release(true);
        }
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
            running?.catch(() => {}),
            ...endings,
          ]);
        } finally {
          clearTimeout(force);
        }
      })()),
  };
}
