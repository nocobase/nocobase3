import { randomUUID } from 'node:crypto';
import { Redis, Cluster } from 'ioredis';
import { Pool } from 'pg';
import {
  createPostgresBackend,
  createRedisBackend,
  runMigrations,
} from 'bullmq';
import type { BackendFactory, ConnectionOptions } from 'bullmq';

export type TestBackend =
  'inMemory' | 'redis' | 'cluster' | 'postgres' | 'postgres13';

export interface BackendHarness {
  backend: TestBackend;
  namespace: string;
  connection: ConnectionOptions | Pool;
  factory: BackendFactory;
  close(): Promise<void>;
}

export function selectedBackend(): TestBackend {
  const backend = process.env.QUEUE_TEST_BACKEND;
  if (
    backend !== 'inMemory' &&
    backend !== 'redis' &&
    backend !== 'cluster' &&
    backend !== 'postgres' &&
    backend !== 'postgres13'
  ) {
    throw new Error(
      'Run integration tests through scripts/test-integration.mjs with an explicit backend',
    );
  }
  return backend;
}

function port(value: string | undefined): number {
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > 65535)
    throw new Error('Missing or invalid isolated test port');
  return result;
}

/** Owns only test-created connections; close Queue/Worker handles before this harness. */
export async function createBackendHarness(
  memoryFactory?: BackendFactory,
): Promise<BackendHarness> {
  const backend = selectedBackend();
  const namespace = `test-${randomUUID()}`;
  if (backend === 'inMemory') {
    if (!memoryFactory)
      throw new Error(
        'The real inMemory BackendFactory must be supplied; no fake fallback',
      );
    return {
      backend,
      namespace,
      connection: {},
      factory: memoryFactory,
      close: async () => {},
    };
  }
  if (backend === 'postgres' || backend === 'postgres13') {
    const pool = new Pool({
      host: '127.0.0.1',
      port: port(process.env.QUEUE_TEST_PG_PORT),
      user: 'postgres',
      password: 'queue-test-only',
      database: 'postgres',
      connectionTimeoutMillis: 1000,
      options: '-c search_path=bullmq -c statement_timeout=5000',
    });
    try {
      const lease = await pool.connect();
      try {
        await runMigrations(lease);
      } finally {
        lease.release();
      }
      return {
        backend,
        namespace,
        connection: pool,
        factory: createPostgresBackend,
        close: () => pool.end(),
      };
    } catch (error) {
      await pool.end();
      throw error;
    }
  }
  const options = {
    maxRetriesPerRequest: null,
    lazyConnect: true,
    connectTimeout: 1000,
    commandTimeout: 5000,
  };
  let connection: Redis | Cluster;
  if (backend === 'cluster') {
    const ports = process.env.QUEUE_TEST_CLUSTER_PORTS?.split(',').map(port);
    if (ports?.length !== 3)
      throw new Error('Expected three isolated Cluster node ports');
    const natMap = Object.fromEntries(
      ports.map((external, index) => [
        `127.0.0.1:${7000 + index}`,
        { host: '127.0.0.1', port: external },
      ]),
    );
    connection = new Cluster(
      ports.map((p) => ({ host: '127.0.0.1', port: p })),
      { lazyConnect: true, natMap, redisOptions: options },
    );
  } else
    connection = new Redis({
      ...options,
      host: '127.0.0.1',
      port: port(process.env.QUEUE_TEST_REDIS_PORT),
    });
  connection.on('error', () => {});
  try {
    await connection.connect();
    await connection.ping();
    return {
      backend,
      namespace,
      connection,
      factory: createRedisBackend,
      close: async () => {
        await connection.quit();
      },
    };
  } catch (error) {
    connection.disconnect();
    throw error;
  }
}
