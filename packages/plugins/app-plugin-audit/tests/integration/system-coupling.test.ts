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

const secret = 'G22_SYNTHETIC_SECRET_MUST_NOT_BE_CAPTURED';
const insert = async (
  connection: DatabaseConnection,
  id: string,
): Promise<void> => {
  await connection.query
    .insertInto('g22_items')
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
    target: { dataSource: 'main', resource: 'g22_items' },
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
  it.each([200, 500] as const)(
    'C01 provisional 200 rolls back on outer later failure; final HTTP %s is authoritative',
    async (finalStatus) => {
      const transactions = new AsyncLocalStorage<DatabaseConnection>();
      let provisionalStatus = 0;
      let pendingId = '';
      const s = await createCouplingFixture(
        dialect,
        (composition) => {
          const router = new Hono();
          router.post(
            '/g22/late',
            composition.service.http({ action: 'g22.late' }),
            async (c) => {
              const connection = transactions.getStore();
              if (!connection) throw new Error('Expected outer transaction.');
              await insert(connection, 'late');
              const receipt = await composition.runtime.recorder.record(
                { action: 'g22.pending', outcome: 'success' },
                { transaction: handle(connection) },
              );
              expect(receipt.state).toBe('pending-commit');
              if (receipt.state === 'pending-commit')
                pendingId = receipt.eventId;
              return c.text('provisional success', 200);
            },
          );
          return router;
        },
        (app, main) =>
          app.addHttpMiddleware(
            defineHttpMiddleware({
              name: 'g22-outer-transaction',
              register(router) {
                router.onError((_error, c) =>
                  c.text('safe final transaction failure', finalStatus),
                );
                router.use('/api/g22/late', async (c, next) => {
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
        expect(response.status).toBe(finalStatus);
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
          only(observation, (event) => event.action === 'g22.late'),
        ).toMatchObject({
          kind: 'request',
          outcome: 'failed',
          reasonCode: 'HTTP_HANDLER_ERROR',
          http: { httpStatus: finalStatus },
        });
        expect(JSON.stringify([...local, ...observation])).not.toContain(
          secret,
        );
      } finally {
        transactions.disable();
        await s.close();
      }
    },
  );

  it('C02 real TCP client timeout precedes database commit and server final response', async () => {
    const entered = gate();
    const release = gate();
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      router.get(
        '/g22/timeout',
        composition.service.http({ action: 'g22.timeout' }),
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
      client = fetch(server.url + '/api/g22/timeout', {
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
      const { request } = await facts(s, 'g22.timeout');
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

  it('C03 physical observation-store failure leaves local business and summary committed, then recovers', async () => {
    let attempts = 0;
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      router.post(
        '/g22/observation/:id',
        composition.service.http({ action: 'g22.observation' }),
        async (c) => {
          attempts++;
          await insert(main, c.req.param('id'));
          return c.text('committed', 200);
        },
      );
      return router;
    });
    let broken = false;
    try {
      await auditRaw(
        s.observation,
        'ALTER TABLE "auditEvents" RENAME TO "g22_unavailable_events"',
      );
      broken = true;
      const response = await s.request('/observation/outage', {
        method: 'POST',
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('committed');
      expect(await s.rows()).toEqual([{ id: 'outage', value: secret }]);
      expect(
        only(await s.events(), (event) => event.kind === 'database'),
      ).toMatchObject({ outcome: 'success', store: 'main' });
      expect(s.composition.health.get().state).toBe('degraded');
      await auditRaw(
        s.observation,
        'ALTER TABLE "g22_unavailable_events" RENAME TO "auditEvents"',
      );
      broken = false;
      expect(
        (await s.events('observation')).filter(
          (event) => event.action === 'g22.observation',
        ),
      ).toEqual([]);
      expect(
        (await s.events()).filter((event) => event.kind === 'request'),
      ).toEqual([]);
      const recovery = await s.request('/observation/recovered', {
        method: 'POST',
      });
      expect(recovery.status).toBe(200);
      expect(await recovery.text()).toBe('committed');
      expect(await s.rows()).toEqual([
        { id: 'outage', value: secret },
        { id: 'recovered', value: secret },
      ]);
      expect((await facts(s, 'g22.observation')).request.outcome).toBe(
        'success',
      );
      expect(attempts).toBe(2);
    } finally {
      try {
        if (broken)
          await auditRaw(
            s.observation,
            'ALTER TABLE "g22_unavailable_events" RENAME TO "auditEvents"',
          );
      } finally {
        await s.close();
      }
    }
  });

  it('C04 catching a physical summary append failure cannot commit the outer HTTP transaction', async () => {
    const caught: unknown[] = [];
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      router.onError((_error, c) => c.text('rolled back', 500));
      router.post(
        '/g22/rollback/:id',
        composition.service.http({ action: 'g22.rollback' }),
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
        'ALTER TABLE "auditEvents" RENAME TO "g22_unavailable_events"',
      );
      broken = true;
      const response = await s.request('/rollback/failed', { method: 'POST' });
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('rolled back');
      expect(caught).toMatchObject([{ code: 'AUDIT_WRITE_FAILED' }]);
      expect(await s.rows()).toEqual([]);
      const failed = only(
        await s.events('observation'),
        (event) => event.action === 'g22.rollback',
      );
      expect(failed).toMatchObject({
        outcome: 'failed',
        http: { httpStatus: 500 },
      });
      await auditRaw(
        s.main,
        'ALTER TABLE "g22_unavailable_events" RENAME TO "auditEvents"',
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
          event.action === 'g22.rollback' && event.outcome === 'success',
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
            'ALTER TABLE "g22_unavailable_events" RENAME TO "auditEvents"',
          );
      } finally {
        await s.close();
      }
    }
  });

  it('C05 concurrent recorder retries deduplicate one fact without merging real HTTP or database attempts', async () => {
    const allEntered = gate();
    const release = gate();
    let entered = 0;
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      // The domain fact has a stable trusted scope; each HTTP attempt retains
      // its own request scope. Client Idempotency-Key is never the audit key.
      const recorder = composition.service.bind(
        { appId: 'main', actor: { type: 'anonymous' } },
        { producer: 'g22.domain' },
      );
      router.post(
        '/g22/retry/:id',
        composition.service.http({ action: 'g22.retry' }),
        async (c) => {
          if (++entered === 4) allEntered.release();
          await release.promise;
          await insert(main, c.req.param('id'));
          const receipt = await recorder.record(
            {
              action: 'g22.domain.confirmed',
              outcome: 'success',
              details: { logicalOperation: 'same-domain-fact' },
            },
            { idempotencyKey: 'trusted-g22-key' },
          );
          return c.json(receipt);
        },
      );
      return router;
    });
    const requests = ['a', 'b', 'c', 'd'].map((id) =>
      s.request('/retry/' + id, {
        method: 'POST',
        headers: { 'Idempotency-Key': 'same-client-key' },
      }),
    );
    void Promise.allSettled(requests);
    let originalFailure: unknown;
    try {
      await bounded(allEntered.promise);
      release.release();
      const responses = await bounded(Promise.all(requests));
      expect(responses.map((response) => response.status)).toEqual([
        200, 200, 200, 200,
      ]);
      const receipts = await Promise.all(
        responses.map(
          async (response) =>
            response.json() as Promise<{ state: string; eventId: string }>,
        ),
      );
      expect(receipts.every((receipt) => receipt.state === 'committed')).toBe(
        true,
      );
      expect(new Set(receipts.map((receipt) => receipt.eventId)).size).toBe(1);
      expect(await s.rows()).toEqual(
        ['a', 'b', 'c', 'd'].map((id) => ({ id, value: secret })),
      );
      const observation = await s.events('observation');
      const local = await s.events();
      const requestsEvents = observation.filter(
        (event) => event.action === 'g22.retry',
      );
      const summaries = local.filter((event) => event.kind === 'database');
      expect(requestsEvents).toHaveLength(4);
      expect(summaries).toHaveLength(4);
      expect(new Set(requestsEvents.map((event) => event.requestId)).size).toBe(
        4,
      );
      expect(
        new Set(requestsEvents.map((event) => event.operationId)).size,
      ).toBe(4);
      for (const request of requestsEvents) {
        expect(request).toMatchObject({
          outcome: 'success',
          http: { httpStatus: 200 },
        });
        expect(
          only(summaries, (event) => event.requestId === request.requestId),
        ).toMatchObject({
          outcome: 'success',
          operationId: request.operationId,
        });
      }
      expect(
        only(observation, (event) => event.action === 'g22.domain.confirmed')
          .id,
      ).toBe(receipts[0].eventId);
      expect(JSON.stringify([...local, ...observation])).not.toContain(secret);
    } catch (error) {
      originalFailure = error;
      throw error;
    } finally {
      release.release();
      await finishCouplingFixture(requests, s.close, originalFailure);
    }
  });

  it('C06 concurrent conflicting idempotency rolls back the losing business transaction and preserves both HTTP attempts', async () => {
    const entered = gate();
    const release = gate();
    let count = 0;
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      const recorder = composition.service.bind(
        { appId: 'main', actor: { type: 'anonymous' } },
        { producer: 'g22.domain' },
      );
      router.onError((error, c) => {
        if ('code' in error && error.code === 'AUDIT_IDEMPOTENCY_CONFLICT')
          return c.text('conflict', 409);
        return c.text('unexpected failure', 500);
      });
      router.post(
        '/g22/conflict/:id',
        composition.service.http({ action: 'g22.conflict' }),
        async (c) => {
          const id = c.req.param('id');
          if (++count === 2) entered.release();
          await release.promise;
          await main.transaction(async (connection) => {
            await insert(connection, id);
            const receipt = await recorder.record(
              {
                action: 'g22.domain.winner',
                outcome: 'success',
                details: { winner: id },
              },
              {
                transaction: handle(connection),
                idempotencyKey: 'conflicting-g22-key',
              },
            );
            expect(receipt.state).toBe('pending-commit');
          });
          return c.text(id, 200);
        },
      );
      return router;
    });
    const requests = ['a', 'b'].map((id) =>
      s.request('/conflict/' + id, { method: 'POST' }),
    );
    void Promise.allSettled(requests);
    let originalFailure: unknown;
    try {
      await bounded(entered.promise);
      release.release();
      const responses = await bounded(Promise.all(requests));
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const winnerResponse = responses.find(
        (response) => response.status === 200,
      );
      if (!winnerResponse) throw new Error('Expected one committed winner.');
      const winner = await winnerResponse.text();
      expect(await s.rows()).toEqual([{ id: winner, value: secret }]);
      const local = await s.events();
      const observation = await s.events('observation');
      expect(
        only(local, (event) => event.action === 'g22.domain.winner'),
      ).toMatchObject({ details: { winner } });
      const summary = only(local, (event) => event.kind === 'database');
      const attempts = observation.filter(
        (event) => event.action === 'g22.conflict',
      );
      expect(attempts).toHaveLength(2);
      expect(
        only(attempts, (event) => event.requestId === summary.requestId),
      ).toMatchObject({ outcome: 'success', http: { httpStatus: 200 } });
      expect(
        only(attempts, (event) => event.requestId !== summary.requestId),
      ).toMatchObject({ outcome: 'failed', http: { httpStatus: 409 } });
      expect(JSON.stringify([...local, ...observation])).not.toContain(secret);
    } catch (error) {
      originalFailure = error;
      throw error;
    } finally {
      release.release();
      await finishCouplingFixture(requests, s.close, originalFailure);
    }
  });

  it('C07 hot policy update retains request-entry revision while cached writes read the live execution revision', async () => {
    const entered = gate();
    const release = gate();
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      const cached = main.query
        .insertInto('g22_items')
        .values({ id: 'before', value: secret });
      router.post(
        '/g22/policy/:id',
        composition.service.http({ action: 'g22.policy' }),
        async (c) => {
          if (c.req.param('id') === 'before') {
            entered.release();
            await release.promise;
            await cached.execute();
          } else await insert(main, 'after');
          return c.text('committed', 200);
        },
      );
      return router;
    });
    let request: Promise<Response> | undefined;
    let originalFailure: unknown;
    try {
      const settings = s.composition.routes().settings;
      const scope = s.composition.runtime.current();
      const before = await settings.get(scope);
      request = s.request('/policy/before', { method: 'POST' });
      await bounded(entered.promise);
      await settings.update(scope, {
        expectedRevision: before.revision,
        settings: { ...before, maxDetailsBytes: before.maxDetailsBytes + 1024 },
        confirmRetentionReduction: false,
      });
      const after = await settings.get(scope);
      expect(after.revision).toBe(before.revision + 1);
      release.release();
      const first = await bounded(request);
      expect(first.status).toBe(200);
      expect(await first.text()).toBe('committed');
      const firstFacts = await facts(s, 'g22.policy');
      expect(firstFacts.request.policyVersion).toBe(before.revision);
      expect(firstFacts.database.policyVersion).toBe(after.revision);
      const second = await s.request('/policy/after', { method: 'POST' });
      expect(second.status).toBe(200);
      expect(await second.text()).toBe('committed');
      expect(await s.rows()).toEqual([
        { id: 'after', value: secret },
        { id: 'before', value: secret },
      ]);
      const requests = (await s.events('observation')).filter(
        (event) => event.action === 'g22.policy',
      );
      expect(requests).toHaveLength(2);
      const next = only(
        requests,
        (event) => event.requestId !== firstFacts.request.requestId,
      );
      expect(next).toMatchObject({
        outcome: 'success',
        policyVersion: after.revision,
      });
      const summaries = (await s.events()).filter(
        (event) => event.kind === 'database',
      );
      expect(summaries).toHaveLength(2);
      expect(
        only(summaries, (event) => event.requestId === next.requestId)
          .policyVersion,
      ).toBe(after.revision);
      expect(JSON.stringify([...requests, ...summaries])).not.toContain(secret);
    } catch (error) {
      originalFailure = error;
      throw error;
    } finally {
      release.release();
      await finishCouplingFixture([request], s.close, originalFailure);
    }
  });

  it('C08 production shutdown rejects new admission and drains a real transaction before disposing providers', async () => {
    const entered = gate();
    const release = gate();
    let executions = 0;
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      router.post(
        '/g22/shutdown/:id',
        composition.service.http({ action: 'g22.shutdown' }),
        async (c) => {
          executions++;
          await main.transaction(async (connection) => {
            await insert(connection, c.req.param('id'));
            entered.release();
            await release.promise;
          });
          return c.text('drained and committed', 200);
        },
      );
      return router;
    });
    const request = s.request('/shutdown/admitted', { method: 'POST' });
    let shutdown: Promise<void> | undefined;
    let stopped = false;
    let originalFailure: unknown;
    try {
      await bounded(entered.promise);
      shutdown = s.app.shutdown().then(() => {
        stopped = true;
      });
      const rejected = await s.request('/shutdown/rejected', {
        method: 'POST',
      });
      expect(rejected.status).toBe(503);
      expect(await rejected.text()).toBe('Application is shutting down.');
      expect(stopped).toBe(false);
      expect(executions).toBe(1);
      release.release();
      const response = await bounded(request);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('drained and committed');
      await bounded(shutdown);
      expect(stopped).toBe(true);
      expect(await s.rows()).toEqual([{ id: 'admitted', value: secret }]);
      expect((await facts(s, 'g22.shutdown')).request).toMatchObject({
        outcome: 'success',
        http: { httpStatus: 200 },
      });
      expect(
        (await s.events('observation')).filter(
          (event) => event.kind === 'request',
        ),
      ).toHaveLength(1);
    } catch (error) {
      originalFailure = error;
      throw error;
    } finally {
      release.release();
      await finishCouplingFixture(
        [request, shutdown],
        s.close,
        originalFailure,
      );
    }
  });
  it('C09 handler failure after an independent managed commit retains business and database success with request failed', async () => {
    let executions = 0;
    const s = await createCouplingFixture(dialect, (composition, main) => {
      const router = new Hono();
      router.onError((_error, c) => c.text('safe post-commit failure', 500));
      router.post(
        '/g22/post-commit',
        composition.service.http({ action: 'g22.post-commit' }),
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
      const { request, database } = await facts(s, 'g22.post-commit');
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
          (event) => event.action === 'g22.post-commit',
        ),
      ).toHaveLength(1);
    } finally {
      await s.close();
    }
  });
});
