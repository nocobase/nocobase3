import type { DatabaseConnection } from '@nocobase/db';

interface Pool {
  numUsed(): number;
  numFree(): number;
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
/** Retain classifications only, never SQL text, bindings or connection identities. */
export async function observePerformance(
  connection: DatabaseConnection,
): Promise<{
  stop(): {
    sql: Record<string, number>;
    pool: {
      before: number[];
      after: number[];
      peakUsed: number;
      peakPending: number;
      acquired: number;
      released: number;
      created: number;
      destroyed: number;
    };
  };
}> {
  const client = await connection.client<ObservedClient>();
  const pool = client.client.pool;
  const snapshot = (): number[] => [
    pool.numUsed(),
    pool.numFree(),
    pool.numPendingAcquires(),
    pool.numPendingCreates(),
  ];
  const before = snapshot();
  const sql: Record<string, number> = {};
  let peakUsed = 0;
  let peakPending = 0;
  let acquired = 0;
  let released = 0;
  let created = 0;
  let destroyed = 0;
  const sample = (): void => {
    peakUsed = Math.max(peakUsed, pool.numUsed());
    peakPending = Math.max(peakPending, pool.numPendingAcquires());
  };
  const listener = (query: { sql: string }): void => {
    const verb =
      /^\s*(select|insert|update|delete|begin|commit|rollback|savepoint|release)\b/i
        .exec(query.sql)?.[1]
        ?.toLowerCase() ?? 'other';
    const target = /\bg22_perf_(rows|excluded)\b/i.test(query.sql)
      ? 'business'
      : /\bauditSettings\b/i.test(query.sql)
        ? 'settings'
        : /\bauditEvents\b/i.test(query.sql)
          ? 'events'
          : 'control';
    const key = target + '.' + verb;
    sql[key] = (sql[key] ?? 0) + 1;
    sample();
  };
  const listeners: [string, () => void][] = [
    [
      'acquireSuccess',
      () => {
        acquired++;
        sample();
      },
    ],
    ['acquireRequest', sample],
    [
      'release',
      () => {
        released++;
        sample();
      },
    ],
    [
      'createSuccess',
      () => {
        created++;
        sample();
      },
    ],
    [
      'destroySuccess',
      () => {
        destroyed++;
        sample();
      },
    ],
  ];
  client.on('query', listener);
  for (const [event, callback] of listeners) pool.on(event, callback);
  return {
    stop() {
      client.removeListener('query', listener);
      for (const [event, callback] of listeners)
        pool.removeListener(event, callback);
      return {
        sql,
        pool: {
          before,
          after: snapshot(),
          peakUsed,
          peakPending,
          acquired,
          released,
          created,
          destroyed,
        },
      };
    },
  };
}
