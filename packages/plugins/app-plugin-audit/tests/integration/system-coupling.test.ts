import { AsyncLocalStorage } from 'node:async_hooks';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { defineHttpMiddleware } from '@nocobase/app-server/router';
import type { DatabaseConnection } from '@nocobase/db';
import type { AuditEventDto } from '../../server/contracts.js';
import { auditRaw, dialects, handle } from '../helpers/database-fixtures.js';
import {
  bounded,
  createCouplingFixture,
  gate,
  type CouplingFixture,
} from '../helpers/system-fixture.js';
import { serveCouplingApp } from '../helpers/system-http.js';
import {
  finishCouplingFixture,
  runCouplingCleanup,
} from '../helpers/system-teardown.js';

const secret = 'TRANSACTION_SYNTHETIC_SECRET_MUST_NOT_BE_CAPTURED';
const insert = async (
  connection: DatabaseConnection,
  id: string,
): Promise<void> => {
  await connection.query
    .insertInto('transaction_items')
    .values({ id, value: secret })
    .execute();
};
function only(
  events: readonly AuditEventDto[],
  predicate: (event: AuditEventDto) => boolean,
): AuditEventDto {
  const matches = events.filter(predicate);
  expect(matches).toHaveLength(1);
  return matches[0];
}
async function facts(
  s: CouplingFixture,
  action: string,
): Promise<{ request: AuditEventDto; database: AuditEventDto }> {
  const observation = await s.events('observation');
  const local = await s.events();
  const request = only(observation, (event) => event.action === action);
  expect(request.requestId).toEqual(expect.any(String));
  const database = only(
    local,
    (event) =>
      event.kind === 'database' && event.requestId === request.requestId,
  );
  expect(database).toMatchObject({
    outcome: 'success',
    store: 'main',
    appId: 'main',
    operationId: request.operationId,
    target: { dataSource: 'main', resource: 'transaction_items' },
    actor: request.actor,
  });
  expect(
    observation.filter((event) => event.requestId === request.requestId),
  ).toHaveLength(1);
  expect(
    local.filter((event) => event.requestId === request.requestId),
  ).toHaveLength(1);
  expect(JSON.stringify([...observation, ...local])).not.toContain(secret);
  return { request, database };
}

// No concurrent suites: each case exclusively owns and drops its random databases.
describe.each(dialects)('production system coupling %s', (dialect) => {
  it('outer failure rolls back provisional success even when onError returns 200', async () => {
    const transactions = new AsyncLocalStorage<DatabaseConnection>();
    let provisionalStatus = 0;
    let pendingId = '';
    const s = await createCouplingFixture(
      dialect,
      (composition) => {
        const router = new Hono();
        router.post(
          '/transactions/late',
          composition.service.http({ action: 'transactions.late' }),
          async (c) => {
            const connection = transactions.getStore();
            if (!connection) throw new Error('Expected outer transaction.');
            await insert(connection, 'late');
            const receipt = await composition.runtime.recorder.record(
              { action: 'transactions.pending', outcome: 'success' },
              { transaction: handle(connection) },
            );
            expect(receipt.state).toBe('pending-commit');
            if (receipt.state === 'pending-commit') pendingId = receipt.eventId;
            return c.text('provisional success', 200);
          },
        );
        return router;
      },
      (app, main) =>
        app.addHttpMiddleware(
          defineHttpMiddleware({
            name: 'transactions-outer-transaction',
            register(router) {
              router.onError((_error, c) =>
                c.text('safe final transaction failure', 200),
              );
              router.use('/api/transactions/late', async (c, next) => {
                await main.transaction((connection) =>
                  transactions.run(connection, async () => {
                    await next();
                    provisionalStatus = c.res.status;
                    throw new Error(secret);
                  }),
                );
              });
            },
          }),
        ),
    );
    try {
      const response = await s.request('/late', { method: 'POST' });
      expect(provisionalStatus).toBe(200);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('safe final transaction failure');
      expect(pendingId).not.toBe('');
      expect(await s.rows()).toEqual([]);
      const local = await s.events();
      expect(
        local.some(
          (event) => event.id === pendingId || event.kind === 'database',
        ),
      ).toBe(false);
      const observation = await s.events('observation');
      expect(
        only(observation, (event) => event.action === 'transactions.late'),
      ).toMatchObject({
        kind: 'request',
        outcome: 'failed',
        reasonCode: 'HTTP_HANDLER_ERROR',
        http: { httpStatus: 200 },
      });
      expect(JSON.stringify([...local, ...observation])).not.toContain(secret);
    } finally {
      transactions.disable();
      await s.close();
    }
  });

  it('real TCP client timeout precedes database commit and server final response', async () => {
    const entered = gate();
    const release = gate();
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      router.get(
        '/transactions/timeout',
        composition.service.http({ action: 'transactions.timeout' }),
        async (c) => {
          entered.release();
          await release.promise;
          expect(c.req.raw.signal.aborted).toBe(true);
          await insert(main, 'timeout');
          return c.text('committed after disconnect', 200);
        },
      );
      return router;
    });
    let server: Awaited<ReturnType<typeof serveCouplingApp>> | undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let client: Promise<unknown> | undefined;
    let originalFailure: unknown;
    try {
      server = await serveCouplingApp(s.app);
      client = fetch(server.url + '/api/transactions/timeout', {
        signal: controller.signal,
      }).then(
        (response) => ({ response }),
        (error: unknown) => ({ error }),
      );
      await bounded(entered.promise);
      expect(await s.rows()).toEqual([]);
      // Start the client's deadline only after admission, avoiding startup races.
      timer = setTimeout(
        () =>
          controller.abort(
            new DOMException('Synthetic client deadline.', 'TimeoutError'),
          ),
        25,
      );
      expect(await bounded(client)).toMatchObject({
        error: { name: 'TimeoutError' },
      });
      await bounded(server.disconnected);
      await bounded(server.aborted);
      expect(await s.rows()).toEqual([]);
      release.release();
      expect(await bounded(server.completed)).toBe(200);
      expect(await s.rows()).toEqual([{ id: 'timeout', value: secret }]);
      const { request } = await facts(s, 'transactions.timeout');
      // The collector observes App response completion, not TCP delivery receipts.
      expect(request).toMatchObject({
        outcome: 'success',
        http: { httpStatus: 200 },
      });
    } catch (error) {
      originalFailure = error;
      throw error;
    } finally {
      clearTimeout(timer);
      controller.abort();
      release.release();
      await finishCouplingFixture(
        [client],
        async () =>
          runCouplingCleanup([
            {
              name: 'HTTP server',
              run: () => server?.close(),
              timeoutMs: 7000,
            },
            { name: 'fixture', run: s.close, timeoutMs: 17000 },
          ]),
        originalFailure,
      );
    }
  });

  it('catching a physical summary append failure cannot commit the outer HTTP transaction', async () => {
    const caught: unknown[] = [];
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      router.onError((_error, c) => c.text('rolled back', 500));
      router.post(
        '/transactions/rollback/:id',
        composition.service.http({ action: 'transactions.rollback' }),
        async (c) => {
          await main.transaction(async (connection) => {
            try {
              await insert(connection, c.req.param('id'));
            } catch (error) {
              caught.push(error);
            }
            return 'caught and returned normally';
          });
          return c.text('committed', 200);
        },
      );
      return router;
    });
    let broken = false;
    try {
      await auditRaw(
        s.main,
        'ALTER TABLE "auditEvents" RENAME TO "transactions_unavailable_events"',
      );
      broken = true;
      const response = await s.request('/rollback/failed', { method: 'POST' });
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('rolled back');
      expect(caught).toMatchObject([{ code: 'AUDIT_WRITE_FAILED' }]);
      expect(await s.rows()).toEqual([]);
      const failed = only(
        await s.events('observation'),
        (event) => event.action === 'transactions.rollback',
      );
      expect(failed).toMatchObject({
        outcome: 'failed',
        http: { httpStatus: 500 },
      });
      await auditRaw(
        s.main,
        'ALTER TABLE "transactions_unavailable_events" RENAME TO "auditEvents"',
      );
      broken = false;
      expect(
        (await s.events()).filter((event) => event.kind === 'database'),
      ).toEqual([]);
      const recovery = await s.request('/rollback/recovered', {
        method: 'POST',
      });
      expect(recovery.status).toBe(200);
      expect(await recovery.text()).toBe('committed');
      expect(await s.rows()).toEqual([{ id: 'recovered', value: secret }]);
      const successful = only(
        await s.events('observation'),
        (event) =>
          event.action === 'transactions.rollback' &&
          event.outcome === 'success',
      );
      const summary = only(
        await s.events(),
        (event) => event.kind === 'database',
      );
      expect(summary.requestId).toBe(successful.requestId);
      expect(summary.requestId).not.toBe(failed.requestId);
      expect(JSON.stringify([summary, successful, failed])).not.toContain(
        secret,
      );
    } finally {
      try {
        if (broken)
          await auditRaw(
            s.main,
            'ALTER TABLE "transactions_unavailable_events" RENAME TO "auditEvents"',
          );
      } finally {
        await s.close();
      }
    }
  });

  it('rolls back the loser of concurrent idempotency conflicts while recording both HTTP attempts', async () => {
    const ready = gate();
    let arrivals = 0;
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      const recorder = composition.service.bind(
        { appId: 'main', actor: { type: 'anonymous' } },
        { producer: 'domain' },
      );
      router.onError((error, c) =>
        'code' in error && error.code === 'AUDIT_IDEMPOTENCY_CONFLICT'
          ? c.text('conflict', 409)
          : c.text('unexpected failure', 500),
      );
      router.post(
        '/transactions/conflict/:id',
        composition.service.http({ action: 'domain.conflict' }),
        async (c) => {
          const id = c.req.param('id');
          if (++arrivals === 2) ready.release();
          await ready.promise;
          await main.transaction(async (connection) => {
            await insert(connection, id);
            await recorder.record(
              {
                action: 'domain.winner',
                outcome: 'success',
                details: { winner: id },
              },
              {
                transaction: handle(connection),
                idempotencyKey: 'conflicting-key',
              },
            );
          });
          return c.text(id);
        },
      );
      return router;
    });
    const requests = ['a', 'b'].map((id) =>
      s.request('/conflict/' + id, { method: 'POST' }),
    );
    void Promise.allSettled(requests);
    try {
      const responses = await bounded(Promise.all(requests));
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const winner = await responses
        .find((response) => response.status === 200)!
        .text();
      expect(await s.rows()).toEqual([{ id: winner, value: secret }]);
      const local = (await s.events()).filter(
        (event) => event.action !== 'audit.runtime.ready',
      );
      expect(local).toHaveLength(2);
      expect(
        only(local, (event) => event.action === 'domain.winner'),
      ).toMatchObject({ details: { winner } });
      const summary = only(local, (event) => event.kind === 'database');
      const attempts = (await s.events('observation')).filter(
        (event) => event.action === 'domain.conflict',
      );
      expect(attempts).toHaveLength(2);
      expect(
        only(attempts, (event) => event.requestId === summary.requestId),
      ).toMatchObject({ outcome: 'success', http: { httpStatus: 200 } });
      expect(
        only(attempts, (event) => event.requestId !== summary.requestId),
      ).toMatchObject({ outcome: 'failed', http: { httpStatus: 409 } });
      expect(JSON.stringify([...local, ...attempts])).not.toContain(secret);
    } finally {
      ready.release();
      await finishCouplingFixture(requests, s.close);
    }
  });

  it('handler failure after an independent managed commit retains business and database success with request failed', async () => {
    let executions = 0;
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      router.onError((_error, c) => c.text('safe post-commit failure', 500));
      router.post(
        '/transactions/post-commit',
        composition.service.http({ action: 'transactions.post-commit' }),
        async () => {
          executions++;
          await insert(main, 'committed-before-error');
          throw new Error(secret);
        },
      );
      return router;
    });
    try {
      const response = await s.request('/post-commit', { method: 'POST' });
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('safe post-commit failure');
      expect(await s.rows()).toEqual([
        { id: 'committed-before-error', value: secret },
      ]);
      expect(executions).toBe(1);
      const { request, database } = await facts(s, 'transactions.post-commit');
      expect(request).toMatchObject({
        kind: 'request',
        outcome: 'failed',
        reasonCode: 'HTTP_HANDLER_ERROR',
        http: { httpStatus: 500 },
      });
      expect(database).toMatchObject({
        kind: 'database',
        outcome: 'success',
        requestId: request.requestId,
        operationId: request.operationId,
      });
      expect(request.operationId).toEqual(expect.any(String));
      expect(
        (await s.events()).filter((event) => event.kind === 'database'),
      ).toHaveLength(1);
      expect(
        (await s.events('observation')).filter(
          (event) => event.action === 'transactions.post-commit',
        ),
      ).toHaveLength(1);
    } finally {
      await s.close();
    }
  });
});
