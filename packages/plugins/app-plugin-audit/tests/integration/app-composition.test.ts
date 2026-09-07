import {
  auditRaw,
  auditRows,
  storedText,
} from '../../server/database/sql-client.js';
import { Hono } from 'hono';
import { defineApiRoutes } from '@nocobase/app-server/router';
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
import { ServiceProvider } from '@nocobase/service-provider';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { describe, expect, it, vi } from 'vitest';
import * as databaseExports from '@nocobase/db';
import { databaseLifecycleObserverToken } from '@nocobase/app-server/database';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { createQueueManager, createSyncQueueConfig } from '@nocobase/queue';
import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  auditPermissionId,
  auditResourceAdaptersToken,
  auditServiceToken,
  createAuditDatabaseResourceAdapter,
  PortableAuditStore,
} from '../../server/index.js';
import { auditCompositionToken } from '../../server/providers/composition.js';
import { AuditDatabaseCollector } from '../../server/database-collector.js';
import { AuditError } from '../../server/errors.js';
import { AuditRetentionService } from '../../server/retention-service.js';
import AuditRetentionJob from '../../server/queue/retention-job.js';
import type { AuditEventDto } from '../../server/contracts.js';

import { dialects } from '../helpers/database-fixtures.js';
import {
  bounded,
  createProductionApp as fixture,
} from '../helpers/system-fixture.js';

const json = (body: object, cookie?: string): RequestInit => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    ...(cookie ? { cookie } : {}),
  },
  body: JSON.stringify(body),
});

describe.each(dialects)('production composition %s', (dialect) => {
  it('persists migration and seed observations through the registered database observer', async () => {
    const s = await fixture(dialect);
    try {
      s.app.registerProviders();
      const observer = s.app.container.resolve(databaseLifecycleObserverToken);
      for (const [phase, outcome] of [
        ['migrations', 'success'],
        ['seeds', 'failed'],
      ] as const) {
        await observer.before(phase);
        await observer.after({
          phase,
          outcome,
          code:
            outcome === 'success'
              ? 'DATABASE_TASK_COMPLETED'
              : 'DATABASE_TASK_FAILED',
        });
      }
      const events = (
        await auditRows(s.f.connection, 'SELECT "payload" FROM "auditEvents"')
      ).map((row) => JSON.parse(storedText(row, 'payload')) as AuditEventDto);
      expect(events).toHaveLength(4);
      for (const [action, outcome, code] of [
        ['database.migrations.attempted', 'accepted', undefined],
        ['database.migrations.completed', 'success', 'DATABASE_TASK_COMPLETED'],
        ['database.seeds.attempted', 'accepted', undefined],
        ['database.seeds.completed', 'failed', 'DATABASE_TASK_FAILED'],
      ]) {
        expect(events.filter((event) => event.action === action)).toEqual([
          expect.objectContaining({
            appId: 'main',
            kind: 'business',
            outcome,
            ...(code ? { details: { code } } : {}),
          }),
        ]);
      }
    } finally {
      await s.close();
    }
  });

  it('continues production collector and runtime cleanup after HTTP disposal fails', async () => {
    const s = await fixture(dialect);
    let shutdownFailed = false;
    try {
      await s.app.start();
      const composition = s.app.container.resolve(auditCompositionToken);
      const http = composition.routes().http;
      const dispose = http.dispose.bind(http);
      const failure = new Error('Synthetic HTTP cleanup failure.');
      vi.spyOn(http, 'dispose').mockImplementationOnce(async () => {
        await dispose();
        throw failure;
      });
      const collectors = vi.spyOn(AuditDatabaseCollector.prototype, 'dispose');
      const catalog = vi.spyOn(composition.catalog, 'dispose');
      const runtime = vi.spyOn(composition.runtime, 'dispose');
      shutdownFailed = true;
      await expect(s.app.shutdown()).rejects.toMatchObject({
        errors: [failure],
      });
      expect(collectors).toHaveBeenCalledTimes(1);
      expect(catalog).toHaveBeenCalledTimes(1);
      expect(runtime).toHaveBeenCalledTimes(1);
      expect(() => composition.runtime.current()).toThrow();
      expect(
        composition.catalog
          .entries(
            await composition
              .routes()
              .settings.get({ appId: 'main', actor: { type: 'unknown' } }),
          )
          .some((entry) => entry.live),
      ).toBe(false);
      await s.f.connection.query
        .insertInto('g20_items')
        .values({ id: 'after-disposal', name: 'collector detached' })
        .execute();
    } finally {
      vi.restoreAllMocks();
      if (shutdownFailed)
        await expect(s.close()).rejects.toThrow('teardown failed');
      else await s.close();
    }
  });

  it('runs production retention through Queue with a fixed retry plan and detaches its binding on shutdown', async () => {
    const s = await fixture(dialect);
    const queue = createQueueManager(
      { ...createSyncQueueConfig(), retry: { maxRetries: 1 } },
      {
        database: s.f.manager,
        jobFactory: (JobClass) => new JobClass({ database: s.f.manager }),
      },
    );
    s.app.container.instance(queueManagerToken, queue);
    let restarted: Application | undefined;
    try {
      s.app.registerProviders();
      const composition = s.app.container.resolve(auditCompositionToken);
      await composition.prepare();
      const expired = await composition.runtime.recorder.record({
        action: 'retention.expired',
        outcome: 'success',
      });
      expect(expired.state).toBe('committed');
      if (expired.state !== 'committed')
        throw new Error('Expected a committed event.');
      await auditRaw(
        s.f.connection,
        'UPDATE "auditEvents" SET "occurredAt" = ? WHERE "id" = ?',
        ['2000-01-01T00:00:00.000Z', expired.eventId],
      );
      const started = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(started);
      const run = vi.spyOn(AuditRetentionService.prototype, 'run');
      const append = PortableAuditStore.prototype.appendWithLimits;
      let failed = false;
      vi.spyOn(
        PortableAuditStore.prototype,
        'appendWithLimits',
      ).mockImplementation(async function (
        this: PortableAuditStore,
        event,
        options,
        limits,
      ) {
        if (event.action === 'audit.cleanup.batch' && !failed) {
          failed = true;
          clock.mockReturnValue(started + 86400000);
          throw new AuditError('AUDIT_WRITE_FAILED');
        }
        return append.call(this, event, options, limits);
      });
      const dispatch = vi.spyOn(queue, 'dispatch');
      await s.app.start();
      expect(run).toHaveBeenCalledTimes(2);
      expect(run.mock.calls[0][0]).toEqual(run.mock.calls[1][0]);
      expect(run.mock.calls[0][0]?.referenceTime).toBe(
        new Date(started).toISOString(),
      );
      expect(
        await auditRows(
          s.f.connection,
          'SELECT "id" FROM "auditEvents" WHERE "id" = ?',
          [expired.eventId],
        ),
      ).toEqual([]);
      expect(
        await auditRows(
          s.f.connection,
          'SELECT "id" FROM "auditEvents" WHERE "action" = ?',
          ['audit.cleanup.batch'],
        ),
      ).toHaveLength(1);
      const payload = dispatch.mock.calls[0][1];
      const job = new AuditRetentionJob({ database: s.f.manager });
      Object.defineProperty(job, 'payload', {
        configurable: true,
        value: { ...payload, binding: 'untrusted-other-app' },
      });
      await expect(job.execute()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      restarted = s.make();
      restarted.container.instance(queueManagerToken, queue);
      await expect(restarted.start()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      await restarted.shutdown();
      await s.app.shutdown();
      Object.defineProperty(job, 'payload', { value: payload });
      await expect(job.execute()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      restarted = s.make();
      restarted.container.instance(queueManagerToken, queue);
      await restarted.start();
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(run).toHaveBeenCalledTimes(3);
    } finally {
      vi.restoreAllMocks();
      try {
        await restarted?.shutdown();
      } finally {
        try {
          await s.close();
        } finally {
          await queue.close();
        }
      }
    }
  });

  it('reports background persistence failures safely and clears them after a committed recovery', async () => {
    const s = await fixture(dialect);
    let unavailable = false;
    const diagnostics = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      await s.app.start();
      const composition = s.app.container.resolve(auditCompositionToken);
      const scope = { appId: 'main', actor: { type: 'system' } };
      const recorder = s.app.container
        .resolve(auditServiceToken)
        .bind(scope, { producer: 'background.worker' });
      const event = {
        action: 'worker.completed',
        outcome: 'success' as const,
        details: { payload: 'private-payload-sentinel' },
      };
      expect((await recorder.record(event)).state).toBe('committed');
      const before = composition.health
        .get()
        .coverage.find((entry) => entry.producer === 'background.worker');
      expect(before?.lastSuccessAt).toBeDefined();
      await expect(
        recorder.record({ ...event, action: '' }),
      ).rejects.toMatchObject({ code: 'AUDIT_INVALID_EVENT' });
      await recorder.record(event, { idempotencyKey: 'completed-job' });
      await expect(
        recorder.record(
          { ...event, action: 'worker.changed' },
          { idempotencyKey: 'completed-job' },
        ),
      ).rejects.toMatchObject({ code: 'AUDIT_IDEMPOTENCY_CONFLICT' });
      expect(
        composition.health
          .get()
          .coverage.find((entry) => entry.producer === 'background.worker')
          ?.lastError,
      ).toBeUndefined();
      diagnostics.mockClear();
      await auditRaw(
        s.f.connection,
        'ALTER TABLE "auditEvents" RENAME TO "unavailableEvents"',
      );
      unavailable = true;
      expect((await composition.routes().settings.get(scope)).enabled).toBe(
        true,
      );
      // An observation failure must not replace an already completed business result.
      await s.f.connection.query
        .insertInto('g20_items')
        .values({ id: 'background-result', name: 'completed' })
        .execute();
      let failure: unknown;
      try {
        await recorder.record(event);
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({
        code: 'AUDIT_WRITE_FAILED',
        message: 'AUDIT_WRITE_FAILED',
      });
      expect(
        await s.f.connection.query
          .selectFrom('g20_items')
          .select('name')
          .where('id', '=', 'background-result')
          .executeTakeFirst(),
      ).toEqual({ name: 'completed' });
      const health = composition.health.get();
      expect(health.state).toBe('degraded');
      expect(
        health.coverage.find((entry) => entry.producer === 'background.worker'),
      ).toMatchObject({
        store: 'main',
        observed: true,
        lastError: { code: 'AUDIT_WRITE_FAILED' },
      });
      expect(diagnostics).toHaveBeenCalledTimes(1);
      expect(diagnostics.mock.calls[0]).toEqual([
        'Audit diagnostic.',
        expect.objectContaining({
          producer: 'background.worker',
          dataSource: 'main',
          code: 'AUDIT_WRITE_FAILED',
        }),
      ]);
      expect(
        JSON.stringify({ health, calls: diagnostics.mock.calls, failure }),
      ).not.toMatch(
        /private-payload-sentinel|unavailableEvents|INSERT|SQLITE|password/,
      );
      await auditRaw(
        s.f.connection,
        'ALTER TABLE "unavailableEvents" RENAME TO "auditEvents"',
      );
      unavailable = false;
      expect((await recorder.record(event)).state).toBe('committed');
      const recovered = composition.health.get();
      expect(recovered.state).not.toBe('degraded');
      expect(
        recovered.coverage.find(
          (entry) => entry.producer === 'background.worker',
        )?.lastError,
      ).toBeUndefined();
      expect(diagnostics).toHaveBeenCalledTimes(1);
    } finally {
      if (unavailable)
        await auditRaw(
          s.f.connection,
          'ALTER TABLE "unavailableEvents" RENAME TO "auditEvents"',
        );
      await s.close();
      diagnostics.mockRestore();
    }
  });
  it('registers during owner boot and drains a transaction despite another HTTP request rejecting', async () => {
    const s = await fixture(dialect, true, {
      defaults: {
        enabled: true,
        sources: {
          http: 'declared-routes',
          runtime: 'integrated-producers',
          database: [{ dataSource: 'main', table: 'g20_items' }],
        },
      },
    });
    const gate = deferred<void>();
    const entered = deferred<void>();
    const fail = deferred<void>();
    const failureEntered = deferred<void>();
    let ownerStopped = false;
    class OwnerProvider extends ServiceProvider<AppPluginApplication> {
      readonly name: string = 'adapter-owner';
      private release?: () => void;
      override async boot(): Promise<void> {
        this.release = this.app.container
          .resolve(auditResourceAdaptersToken)
          .register({
            dataSource: 'main',
            resource: 'g20_items',
            canRead: async () => 'allowed',
          });
      }
      override async shutdown(): Promise<void> {
        ownerStopped = true;
        this.release?.();
      }
    }
    s.app.addServiceProvider(OwnerProvider);
    s.app.addRoutes(
      defineApiRoutes(() => {
        const composition = s.app.container.resolve(auditCompositionToken);
        const router = new Hono();
        router.get(
          '/owner/drain',
          composition.service.http({ action: 'owner.drain' }),
          async (c) => {
            await s.f.connection.transaction(async (connection) => {
              await connection.query
                .insertInto('g20_items')
                .values({ id: 'drained', name: 'committed' })
                .execute();
              entered.resolve();
              await gate.promise;
              expect(ownerStopped).toBe(false);
              await composition.runtime.recorder.record(
                { action: 'owner.ending', outcome: 'success' },
                {
                  transaction:
                    databaseExports.transactionAuthority.current(connection),
                },
              );
            });
            return c.text('committed');
          },
        );
        router.get('/owner/fail', async () => {
          failureEntered.resolve();
          await fail.promise;
          throw new Error('Synthetic request failure.');
        });
        return router;
      }),
    );
    s.app.addHttpMiddleware({
      name: 'owner-error-rejection',
      register(router) {
        router.onError(() => {
          throw new Error('Synthetic final error.');
        });
      },
    });
    let response: Promise<Response> | undefined;
    let broken: Promise<Response> | undefined;
    let shutdown: Promise<void> | undefined;
    try {
      await s.app.start();
      const signup = await s.app.fetch(
        new Request(
          'http://localhost/api/auth/sign-up/email',
          json({
            name: 'Boot owner',
            email: 'boot@example.test',
            password: 'Synthetic long owner password',
          }),
        ),
      );
      expect(signup.status).toBe(200);
      const { user } = (await signup.json()) as { user: { id: string } };
      const cookie = signup.headers.get('set-cookie') ?? '';
      const authz = s.app.container.resolve(authorizationToken);
      await authz.permissionSets.create({
        key: 'boot-owner',
        grants: [
          {
            resource: {
              type: 'audit.events',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: [{ action: 'read' }],
          },
        ],
      });
      await authz.permissionSets.assign({
        subject: { type: 'user', id: user.id },
        permissionSet: 'boot-owner',
      });
      const target = { dataSource: 'main', resource: 'g20_items', key: 'a' };
      const receipt = await s.app.container
        .resolve(auditServiceToken)
        .bind(
          { appId: 'main', actor: { type: 'user', id: user.id } },
          { producer: 'adapter-owner' },
        )
        .record({ action: 'g23.boot', outcome: 'success', target });
      expect(receipt.state).toBe('committed');
      const url =
        'http://localhost/api/audit/events?store=main&target=' +
        encodeURIComponent(JSON.stringify(target));
      expect(
        (await s.app.fetch(new Request(url, { headers: { cookie } }))).status,
      ).toBe(200);
      broken = Promise.resolve(
        s.app.fetch(new Request('http://localhost/api/owner/fail')),
      );
      void broken.catch(() => undefined);
      await bounded(failureEntered.promise);
      response = Promise.resolve(
        s.app.fetch(new Request('http://localhost/api/owner/drain')),
      );
      await bounded(entered.promise);
      shutdown = s.app.shutdown();
      expect(s.app.shutdown()).toBe(shutdown);
      fail.resolve();
      await expect(broken).rejects.toThrow('Synthetic final error.');
      expect((await s.app.fetch(new Request(url))).status).toBe(503);
      expect(ownerStopped).toBe(false);
      gate.resolve();
      expect((await bounded(response)).status).toBe(200);
      await bounded(shutdown);
      expect(ownerStopped).toBe(true);
      expect(
        await auditRows(s.f.connection, 'SELECT * FROM "g20_items"'),
      ).toEqual([{ id: 'drained', name: 'committed' }]);
      const events = (
        await auditRows(s.f.connection, 'SELECT "payload" FROM "auditEvents"')
      )
        .map((row) => JSON.parse(storedText(row, 'payload')) as AuditEventDto)
        .filter((event) =>
          ['owner.drain', 'owner.ending', 'database.insert'].includes(
            event.action,
          ),
        );
      expect(events.map((event) => event.action).sort()).toEqual([
        'database.insert',
        'owner.drain',
        'owner.ending',
      ]);
      expect(new Set(events.map((event) => event.requestId)).size).toBe(1);
      expect(new Set(events.map((event) => event.operationId)).size).toBe(1);
      expect(events.every((event) => event.outcome === 'success')).toBe(true);
      expect(() =>
        s.app.container.resolve(auditCompositionToken).runtime.current(),
      ).toThrow();
      expect(() =>
        s.app.container.resolve(auditResourceAdaptersToken).register({
          dataSource: 'main',
          resource: 'closed',
          canRead: async () => 'allowed',
        }),
      ).toThrow('closed');
    } finally {
      gate.resolve();
      fail.resolve();
      await Promise.allSettled([response, broken, shutdown]);
      await s.close();
    }
  });
  it('makes owner adapters available to production list/detail/operation/count and revokes them live', async () => {
    const s = await fixture(dialect);
    try {
      await s.app.start();
      const request = (path: string, cookie: string = '') =>
        s.app.fetch(
          new Request('http://localhost/api/audit' + path, {
            headers: { cookie },
          }),
        );
      const signup = await s.app.fetch(
        new Request(
          'http://localhost/api/auth/sign-up/email',
          json({
            name: 'Owner',
            email: 'owner@example.test',
            password: 'Synthetic long owner password',
          }),
        ),
      );
      expect(signup.status).toBe(200);
      const { user } = (await signup.json()) as { user: { id: string } };
      const cookie = signup.headers.get('set-cookie') ?? '';
      await s.f.connection.builder.createCollection(
        'adapter_documents',
        (table) => {
          table.string('id').primary();
          table.string('ownerId');
          table.string('tenant');
        },
      );
      await s.f.connection.query
        .insertInto('adapter_documents')
        .values([
          { id: 'a', ownerId: user.id, tenant: 'synthetic' },
          { id: 'b', ownerId: 'another-user', tenant: 'synthetic' },
        ])
        .execute();
      const authz = s.app.container.resolve(authorizationToken);
      authz.database.collections.add({
        name: 'main.adapter_documents',
        actions: ['read'],
        fields: ['id', 'ownerId', 'tenant'],
        attributes: { identifier: 'id', owner: 'ownerId' },
      });
      await authz.permissionSets.create({
        key: 'owner',
        grants: [
          {
            resource: {
              type: 'audit.events',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: [{ action: 'read' }],
          },
          authz.database.grant('main.adapter_documents', {
            read: { fields: { output: ['id'] }, recordAccess: ['recordsIOwn'] },
          }),
        ],
      });
      await authz.permissionSets.assign({
        subject: { type: 'user', id: user.id },
        permissionSet: 'owner',
      });
      const target = {
        dataSource: 'main',
        resource: 'adapter_documents',
        key: 'a',
      };
      const adapter = createAuditDatabaseResourceAdapter({
        connection: s.f.connection,
        resource: target.resource,
        table: 'adapter_documents',
        keyFields: ['id'],
        boundaryFilter: { tenant: { $eq: 'synthetic' } },
      });
      expect(
        await adapter.canRead(
          authz.for({ principal: { type: 'user', id: user.id } }),
          target,
        ),
      ).toBe('allowed');
      const receipt = await s.app.container
        .resolve(auditServiceToken)
        .bind(
          {
            appId: 'main',
            actor: { type: 'user', id: user.id },
            operationId: 'adapter-owner',
          },
          { producer: 'adapter-owner' },
        )
        .record({ action: 'adapter.owner', outcome: 'success', target });
      expect(receipt.state).toBe('committed');
      if (receipt.state !== 'committed')
        throw new Error('Expected committed receipt.');
      const suffix =
        '?store=main&target=' + encodeURIComponent(JSON.stringify(target));
      const paths = [
        '/events' + suffix,
        '/events' + suffix + '&count=true',
        '/events/' + receipt.eventId + suffix,
        '/operations/adapter-owner' + suffix,
      ];
      for (const path of paths)
        expect((await request(path, cookie)).status).toBe(403);
      const registry = s.app.container.resolve(auditResourceAdaptersToken);
      const dispose = registry.register(adapter);
      for (const path of paths) {
        const response = await request(path, cookie);
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(JSON.stringify(body)).toContain(receipt.eventId);
        if (path.endsWith('&count=true'))
          expect(body).toMatchObject({ total: 1 });
      }
      expect(
        (
          await request(
            '/events?store=main&target=' +
              encodeURIComponent(JSON.stringify({ ...target, key: 'b' })),
            cookie,
          )
        ).status,
      ).toBe(403);
      expect((await request('/events' + suffix)).status).toBe(401);
      expect((await request('/events?store=main', cookie)).status).toBe(403);
      dispose();
      for (const path of paths)
        expect((await request(path, cookie)).status).toBe(403);
      const next = registry.register(adapter);
      dispose();
      expect((await request(paths[0], cookie)).status).toBe(200);
      const sibling = s.make();
      try {
        await sibling.start();
        expect(sibling.container.resolve(auditResourceAdaptersToken)).not.toBe(
          registry,
        );
        expect(
          (
            await sibling.fetch(
              new Request('http://localhost/api/audit' + paths[0], {
                headers: { cookie },
              }),
            )
          ).status,
        ).toBe(403);
      } finally {
        await sibling.shutdown();
      }
      expect((await request(paths[0], cookie)).status).toBe(200);
      await s.f.connection.query
        .deleteFrom('adapter_documents')
        .where('id', '=', 'a')
        .execute();
      expect((await request(paths[0], cookie)).status).toBe(403);
      await authz.permissionSets.create({
        key: 'deleted',
        grants: [
          {
            resource: {
              type: 'audit.events',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: [{ action: 'readDeleted' }],
          },
        ],
      });
      await authz.permissionSets.assign({
        subject: { type: 'user', id: user.id },
        permissionSet: 'deleted',
      });
      expect((await request(paths[0], cookie)).status).toBe(200);
      next();
      expect((await request(paths[0], cookie)).status).toBe(403);
      await authz.permissionSets.create({
        key: 'all',
        grants: [
          {
            resource: {
              type: 'audit.events',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: [{ action: 'readAll' }],
          },
        ],
      });
      const all = await authz.permissionSets.assign({
        subject: { type: 'user', id: user.id },
        permissionSet: 'all',
      });
      for (const path of paths)
        expect((await request(path, cookie)).status).toBe(200);
      await authz.permissionSets.revoke(all.id);
      expect((await request(paths[0], cookie)).status).toBe(403);
      await s.app.shutdown();
      expect(() => registry.register(adapter)).toThrow('closed');
    } finally {
      await s.close();
    }
  });
  it('switches runtime and HTTP observation stores, preserves transaction affinity, and restarts with the selected store', async () => {
    const s = await fixture(dialect, true, { stores: ['main', 'other'] }, true);
    let restarted: Application | undefined;
    try {
      await s.app.start();
      const composition = s.app.container.resolve(auditCompositionToken);
      const settings = composition.routes().settings;
      const scope = composition.runtime.current();
      const previous = await settings.get(scope);
      await settings.update(scope, {
        expectedRevision: previous.revision,
        settings: { ...previous, observationStore: 'other' },
        confirmRetentionReduction: false,
      });
      const event = await composition.runtime.recorder.record({
        action: 'g20.after-switch',
        outcome: 'success',
      });
      expect(event.state).toBe('committed');
      await s.f.manager.transaction(async (connection) => {
        const transaction =
          databaseExports.transactionAuthority.current(connection);
        if (!transaction) throw new Error('Expected actual transaction.');
        expect(
          await composition.runtime.recorder.record(
            { action: 'g20.transaction-main', outcome: 'success' },
            { transaction },
          ),
        ).toMatchObject({ state: 'pending-commit' });
      });
      await s.app.fetch(new Request('http://localhost/api/audit/events'));
      const { auditRows } = await import('../../server/database/sql-client.js');
      const actions = async (name: string): Promise<unknown[]> =>
        (
          await auditRows(
            s.f.manager.connection(name),
            'SELECT "action" FROM "auditEvents"',
          )
        ).map((row) => row.action);
      expect(await actions('main')).toContain('g20.transaction-main');
      expect(await actions('main')).not.toContain('g20.after-switch');
      expect(await actions('other')).toContain('g20.after-switch');
      expect(await actions('other')).toContain('audit.api.access');
      expect(await actions('other')).not.toContain('g20.transaction-main');
      await s.app.shutdown();
      restarted = s.make();
      await restarted.start();
      const next = restarted.container.resolve(auditCompositionToken);
      const policy = await next.routes().settings.get(next.runtime.current());
      expect(policy.observationStore).toBe('other');
      expect(
        next.catalog
          .entries(policy)
          .filter((entry) => entry.kind === 'business'),
      ).toHaveLength(2);
      await expect(
        next.routes().settings.update(next.runtime.current(), {
          expectedRevision: policy.revision,
          settings: { ...policy, observationStore: 'unprepared' },
          confirmRetentionReduction: false,
        }),
      ).rejects.toBeInstanceOf(Error);
    } finally {
      await restarted?.shutdown();
      await s.close();
    }
  });
  it('rejects a missing managed-write callback at the real startup probe', async () => {
    const s = await fixture(dialect, true, { auditRequired: true });
    // Fault injection removes only extension delivery; real connections, SQL,
    // authentication, settings, and stores continue to execute.
    const extension = vi
      .spyOn(databaseExports, 'getManagedWriteRegistry')
      .mockReturnValue({
        register: () => () => undefined,
      });
    try {
      await expect(s.app.start()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      await expect(
        s.app.fetch(new Request('http://localhost/api/audit/events')),
      ).rejects.toMatchObject({ code: 'AUDIT_NOT_READY' });
    } finally {
      extension.mockRestore();
      await s.close();
    }
  });
  it('rejects required missing storage through the registered pre-DDL observer', async () => {
    const s = await fixture(dialect, true, { auditRequired: true });
    try {
      await s.f.connection.builder.dropCollection('auditEvents');
      s.app.registerProviders();
      const observer = s.app.container.resolve(databaseLifecycleObserverToken);
      await expect(observer.before('migrations')).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      await expect(s.app.start()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
    } finally {
      await s.close();
    }
  });
  it('uses production providers and routes for anonymous denial, real login, persisted grants, settings and restart', async () => {
    const s = await fixture(dialect);
    let restarted: Application | undefined;
    try {
      const request = (path: string, init?: RequestInit) =>
        Promise.resolve(
          s.app.fetch(new Request('http://localhost/api' + path, init)),
        );
      expect((await request('/audit/events?store=main')).status).toBe(401);
      expect((await request('/audit/capabilities')).status).toBe(401);
      const signup = await request(
        '/auth/sign-up/email',
        json({
          name: 'User',
          email: 'g20@example.test',
          password: 'synthetic long password',
        }),
      );
      expect(signup.status).toBe(200);
      const user = (await signup.json()) as { user: { id: string } };
      const cookie = signup.headers.get('set-cookie') ?? '';
      expect(
        (await request('/audit/events?store=main', { headers: { cookie } }))
          .status,
      ).toBe(403);
      const authz = s.app.container.resolve(authorizationToken);
      await authz.permissionSets.create({
        key: 'g20-page-only',
        grants: [
          {
            resource: { type: 'page', id: '*' },
            actions: [{ action: 'access' }],
          },
        ],
      });
      const pageGrant = await authz.permissionSets.assign({
        subject: { type: 'user', id: user.user.id },
        permissionSet: 'g20-page-only',
      });
      expect(
        await (
          await request('/audit/capabilities', { headers: { cookie } })
        ).json(),
      ).toEqual({
        data: { events: false, settings: false, stores: [] },
      });
      await authz.permissionSets.revoke(pageGrant.id);
      await authz.permissionSets.create({
        key: 'g20-auditor',
        grants: [
          {
            resource: {
              type: 'audit.events',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: ['read', 'readAll', 'readMetadata'].map((action) => ({
              action,
            })),
          },
          {
            resource: {
              type: 'audit.settings',
              id: auditPermissionId({ appId: 'main' }, 'main'),
            },
            actions: ['read', 'manage'].map((action) => ({ action })),
          },
        ],
      });
      const auditGrant = await authz.permissionSets.assign({
        subject: { type: 'user', id: user.user.id },
        permissionSet: 'g20-auditor',
      });
      expect(
        (await request('/audit/events?store=main', { headers: { cookie } }))
          .status,
      ).toBe(200);
      const capabilities = await request('/audit/capabilities', {
        headers: { cookie },
      });
      expect(capabilities.headers.get('cache-control')).toBe('no-store');
      expect(await capabilities.json()).toEqual({
        data: { events: true, settings: true, stores: ['main'] },
      });
      const composition = s.app.container.resolve(auditCompositionToken);
      const settings = await composition
        .routes()
        .settings.get(composition.runtime.current());
      expect(settings.sources.database).toEqual([]);
      await s.f.connection.query
        .insertInto('g20_items')
        .values({ id: 'g20-unselected', name: 'Synthetic' })
        .execute();
      const catalog = composition.catalog.entries(settings);
      expect(
        catalog.some(
          (entry) =>
            entry.kind === 'database' &&
            entry.targets.some((target) => target.table === 'g20_items'),
        ),
      ).toBe(true);
      await composition
        .routes()
        .settings.update(composition.runtime.current(), {
          expectedRevision: settings.revision,
          confirmRetentionReduction: false,
          settings: {
            ...settings,
            retentionDays: 210,
            sources: {
              ...settings.sources,
              database: [{ dataSource: 'main', table: 'g20_items' }],
            },
          },
        });
      await s.f.connection.query
        .updateTable('g20_items')
        .set({ name: 'Selected synthetic' })
        .where('id', '=', 'g20-unselected')
        .execute();
      const queryResources = composition.routes();
      const events = await queryResources.query.list(
        await queryResources.authorization.issue(
          authz.for({ principal: { type: 'user', id: user.user.id } }),
          'main',
        ),
        { store: 'main', kind: 'database' },
      );
      expect(events.items.map((event) => event.action)).toEqual([
        'database.update',
      ]);
      await authz.permissionSets.revoke(auditGrant.id);
      expect(
        await (
          await request('/audit/capabilities', { headers: { cookie } })
        ).json(),
      ).toEqual({
        data: { events: false, settings: false, stores: [] },
      });
      expect(
        (await request('/audit/events?store=main', { headers: { cookie } }))
          .status,
      ).toBe(403);
      await s.app.shutdown();
      restarted = s.make();
      await restarted.start();
      const next = restarted.container.resolve(auditCompositionToken);
      expect(
        (await next.routes().settings.get(next.runtime.current()))
          .retentionDays,
      ).toBe(210);
      expect(
        next.catalog
          .entries(await next.routes().settings.get(next.runtime.current()))
          .filter((entry) => entry.kind === 'request'),
      ).toHaveLength(1);
    } finally {
      await restarted?.shutdown();
      await s.close();
    }
  });

  it('rejects missing stores and mandatory source policy before admitting traffic', async () => {
    for (const overrides of [
      { auditRequired: true, defaults: { enabled: false } },
      { auditRequired: true, stores: ['missing'] },
      { auditRequired: true, mandatorySources: ['database'] as const },
      {
        auditRequired: true,
        mandatorySources: ['business'] as const,
        defaults: {
          enabled: true,
          sources: {
            http: 'declared-routes' as const,
            runtime: 'disabled' as const,
            database: [],
          },
        },
      },
    ]) {
      const s = await fixture(dialect, true, overrides);
      try {
        await expect(s.app.start()).rejects.toBeInstanceOf(Error);
      } finally {
        await s.close();
      }
    }
  });
  it('starts an optional producer composition with Audit absent', async () => {
    const s = await fixture(dialect, false);
    try {
      await s.app.start();
      expect(s.app.hasPlugin('@nocobase/app-plugin-audit')).toBe(false);
      expect(
        (
          await s.app.fetch(
            new Request('http://localhost/api/audit/events?store=main'),
          )
        ).status,
      ).toBe(404);
    } finally {
      await s.close();
    }
  });
});

describe('mounted audit declarations', () => {
  it('rejects conflicting declarations before the application serves requests', async () => {
    const f = await fixture('sqlite');
    let executed = false;
    f.app.addRoutes(
      defineApiRoutes(() => {
        const service = f.app.container.resolve(auditServiceToken);
        const child = new Hono();
        child.onError((_error, context) => context.text('handled', 500));
        child.get(
          '/:id',
          service.http({ action: 'orders.second' }),
          (context) => {
            executed = true;
            return context.text('never');
          },
        );
        return new Hono()
          .use('/orders/*', service.http({ action: 'orders.first' }))
          .route('/orders', child);
      }),
    );
    try {
      await expect(f.app.start()).rejects.toMatchObject({
        code: 'AUDIT_INVALID_EVENT',
      });
      expect(executed).toBe(false);
    } finally {
      await f.close();
    }
  });

  it('allows a scope bridge, shared declarations, distinct methods and disjoint paths', async () => {
    const f = await fixture('sqlite');
    f.app.addRoutes(
      defineApiRoutes(() => {
        const service = f.app.container.resolve(auditServiceToken);
        const composition = f.app.container.resolve(auditCompositionToken);
        const root = new Hono();
        root.use('/orders/*', async (_context, next) => {
          await composition.runtime.runAuthenticated(
            { actor: { type: 'user', id: 'trusted-user' } },
            next,
          );
        });
        const child = new Hono();
        child.onError((_error, context) => context.text('handled', 500));
        const shared = {
          action: 'orders.read',
          titleKey: 'orders.read.title',
          target: () => ({ resource: 'orders' }),
          details: () => ({ source: 'first' }),
        };
        child.get(
          '/:id',
          service.http(shared),
          service.http(shared),
          (context) => context.text('ok'),
        );
        child.post(
          '/:id',
          service.http({ action: 'orders.write' }),
          (context) => context.text('created', 201),
        );
        root.route('/orders', child);
        root.get(
          '/customers/:id',
          service.http({ action: 'customers.read' }),
          (context) => context.text('ok'),
        );
        return root;
      }),
    );
    try {
      await f.app.start();
      expect(
        (await f.app.fetch(new Request('http://localhost/api/orders/one')))
          .status,
      ).toBe(200);
      const composition = f.app.container.resolve(auditCompositionToken);
      expect(
        composition
          .routes()
          .http.describeRoutes(f.app.router.routes)
          .filter(
            (route) =>
              route.method === 'GET' && route.path === '/api/orders/:id',
          ),
      ).toEqual([
        {
          method: 'GET',
          path: '/api/orders/:id',
          action: 'orders.read',
          titleKey: 'orders.read.title',
        },
      ]);
      const { auditRows, storedText } =
        await import('../../server/database/sql-client.js');
      const records = await auditRows(
        f.f.connection,
        'SELECT "payload" FROM "auditEvents" WHERE "action" = ?',
        ['orders.read'],
      );
      expect(records).toHaveLength(1);
      expect(JSON.parse(storedText(records[0], 'payload'))).toMatchObject({
        actor: { type: 'user', id: 'trusted-user' },
        action: 'orders.read',
        outcome: 'success',
      });
      expect(composition.runtime.current().actor.type).toBe('unknown');
    } finally {
      await f.close();
    }
  });
});
