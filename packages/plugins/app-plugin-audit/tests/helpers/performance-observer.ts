import type { DatabaseConnection } from '@nocobase/db';

interface Pool {
  numUsed(): number;
  numPendingAcquires(): number;
  numPendingCreates(): number;
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
}
interface ObservedClient {
  on(event: string, listener: (query: { sql: string }) => void): void;
  removeListener(
    event: string,
    listener: (query: { sql: string }) => void,
  ): void;
  client: { pool: Pool };
}

/** Count SQL classes and balanced leases without retaining SQL text or bindings. */
export async function observeSqlCost(connection: DatabaseConnection): Promise<{
  stop(): {
    sql: Record<string, number>;
    pool: { acquired: number; released: number; idle: boolean };
  };
}> {
  const client = await connection.client<ObservedClient>();
  const pool = client.client.pool;
  const sql: Record<string, number> = {};
  let acquired = 0;
  let released = 0;
  const acquire = (): void => {
    acquired++;
  };
  const release = (): void => {
    released++;
  };
  const query = ({ sql: statement }: { sql: string }): void => {
    const verb =
      /^\s*(select|insert|update|delete)\b/i
        .exec(statement)?.[1]
        ?.toLowerCase() ?? 'other';
    const target = /\bg22_perf_(rows|excluded)\b/i.test(statement)
      ? 'business'
      : /\bauditSettings\b/i.test(statement)
        ? 'settings'
        : /\bauditEvents\b/i.test(statement)
          ? 'events'
          : 'control';
    const key = target + '.' + verb;
    sql[key] = (sql[key] ?? 0) + 1;
  };
  client.on('query', query);
  pool.on('acquireSuccess', acquire);
  pool.on('release', release);
  return {
    stop() {
      client.removeListener('query', query);
      pool.removeListener('acquireSuccess', acquire);
      pool.removeListener('release', release);
      return {
        sql,
        pool: {
          acquired,
          released,
          idle:
            pool.numUsed() === 0 &&
            pool.numPendingAcquires() === 0 &&
            pool.numPendingCreates() === 0,
        },
      };
    },
  };
}
