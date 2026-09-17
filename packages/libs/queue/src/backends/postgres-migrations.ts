import { Socket } from 'node:net';
import { PostgresConnection, runMigrations } from 'bullmq';
import type { PgQueryable, PgQueryResult, PostgresPoolConfig } from 'bullmq';

export interface PostgresMigrationResource {
  run(): Promise<void>;
  close(): Promise<void>;
}

/** Runs official migrations on a dedicated session with a server-side deadline. */
export function createPostgresMigrationResource(
  config: PostgresPoolConfig,
  deadline: number,
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
          await runMigrations(queryable, config.schema, {
            skipVersionCheck: config.skipVersionCheck,
          });
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
