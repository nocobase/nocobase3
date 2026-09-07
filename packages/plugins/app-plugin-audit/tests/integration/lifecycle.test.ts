import { ServiceProvider } from '@nocobase/service-provider';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { Application } from '@nocobase/app-server/application';
import {
  AppConfig,
  appConfig,
  createConfigPaths,
} from '@nocobase/app-server/config';
import { defineApiRoutes } from '@nocobase/app-server/router';
import {
  createQueueManager,
  createSyncQueueConfig,
  Job,
  Schedule,
  Worker,
  QueueManager,
  type JobOptions,
} from '@nocobase/queue';
import { AuditError } from '../../server/errors.js';
import { auditRaw } from '../../server/database/sql-client.js';
import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import { LocalAuditHealthService } from '../../server/health-service.js';
import { AuditReadiness } from '../../server/providers/readiness.js';
import { createAuditHttpResources } from '../../server/providers/http.js';
import { createAuditLifecycleResources } from '../../server/providers/lifecycle.js';
import { NodeAuditScopeCarrier } from '../../server/scope.js';
import { TrustedAuditRuntime } from '../../server/runtime.js';
import { PersistentAuditSettingsService } from '../../server/settings-service.js';
import { AuditRetentionService } from '../../server/retention-service.js';
import { createAuditRetentionQueueResources } from '../../server/queue/retention.js';
import AuditRetentionJob from '../../server/queue/retention-job.js';
import {
  createPortableFixture,
  dialects,
  auditRows,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup(f: PortableFixture) {
  const health = new LocalAuditHealthService(() => undefined);
  const catalog = new AuditCaptureCatalog();
  const readiness = new AuditReadiness({
    stores: [{ connection: f.connection, store: f.store }],
    catalog,
    health,
    requirements: {
      auditRequired: false,
      mandatorySources: [],
      requiredDataSources: [],
    },
  });
  const settings = new PersistentAuditSettingsService({
    connection: f.connection,
    store: f.store,
    readiness,
    health,
    defaults: {
      enabled: true,
      sources: { http: 'declared-routes', runtime: 'disabled', database: [] },
    },
  });
  const initial = await settings.initialize(f.scope);
  const runtime = new TrustedAuditRuntime({
    appId: f.scope.appId,
    carrier: new NodeAuditScopeCarrier(f.scope.appId),
    bind: () => f.recorder,
    diagnostic: () => undefined,
  });
  const retention = new AuditRetentionService({
    connection: f.connection,
    store: f.store,
    configurationStore: f.store,
    settings,
    health,
  });
  const config = new AppConfig([
    {
      ...appConfig,
      defaults: {
        name: 'main',
        publicBasePath: '',
        internalBasePath: '',
        publicApiUrl: '/api',
      },
    },
  ]);
  await config.loadAll();
  const app = new Application({
    config,
    paths: createConfigPaths({ rootDir: '/synthetic/g12' }),
    websocket: () => async () => null,
  });
  const http = createAuditHttpResources({
    application: app,
    runtime,
    settings,
    stores: [f.store],
    health,
    catalog,
    connections: [f.connection],
  });
  return {
    health,
    catalog,
    readiness,
    settings,
    initial,
    runtime,
    retention,
    app,
    http,
  };
}
for (const dialect of dialects)
  describe('lifecycle real ' + dialect, () => {
    async function fixture() {
      const f = await createPortableFixture(dialect);
      cleanups.push(f.cleanup);
      return f;
    }
    it('host shutdown waits for a real ending request before releasing scope and database', async () => {
      const f = await fixture();
      const s = await setup(f);
      const entered = deferred();
      const finish = deferred();
      const router = new Hono();
      router.get(
        '/slow',
        s.http.collector.http({ action: 'synthetic.slow' }),
        async (c) => {
          entered.resolve();
          await finish.promise;
          await f.recorder.record({
            action: 'synthetic.ending',
            outcome: 'success',
          });
          return c.json({ ok: true });
        },
      );
      s.app.addRoutes(defineApiRoutes(() => router));
      await s.http.verify(async () => {
        await s.app.fetch(new Request('http://localhost/probe'));
      });
      await s.readiness.start(s.initial);
      let accepting = true;
      const active = new Set<Promise<Response>>();
      const request = (): Promise<Response> => {
        if (!accepting)
          return Promise.resolve(new Response(null, { status: 503 }));
        const task = Promise.resolve(
          s.app.fetch(new Request('http://localhost/api/slow')),
        );
        active.add(task);
        void task.then(
          () => active.delete(task),
          () => active.delete(task),
        );
        return task;
      };
      const lifecycle = createAuditLifecycleResources({
        stopAccepting: () => {
          accepting = false;
        },
        drainHost: async () => {
          await Promise.allSettled([...active]);
        },
        retention: [s.retention],
        queues: [],
        http: [s.http],
        database: [],
        catalog: s.catalog,
        runtime: s.runtime,
      });
      const response = request();
      await entered.promise;
      let closed = false;
      const closing = lifecycle.dispose().then(() => {
        closed = true;
      });
      expect(lifecycle.dispose()).toBe(lifecycle.dispose());
      expect((await request()).status).toBe(503);
      expect(closed).toBe(false);
      expect(await auditRows(f.connection, 'SELECT 1 AS ok')).toHaveLength(1);
      finish.resolve();
      expect((await response).status).toBe(200);
      await closing;
      const events = (
        await f.store.query(f.scope, { store: 'main', pageSize: 100 })
      ).items;
      expect(events.filter((e) => e.action === 'synthetic.slow')).toHaveLength(
        1,
      );
      expect(
        events.filter((e) => e.action === 'synthetic.ending'),
      ).toHaveLength(1);
      expect(() => s.runtime.current()).toThrow();
      await expect(s.retention.run()).rejects.toThrow();
      expect(await s.settings.get(f.scope)).toEqual(s.initial);
      await s.app.shutdown();
      // A fresh host/resource composition sees persisted settings and one hook, without migrations or purge.
      const restarted = await setup(f);
      const next = new Hono();
      next.get(
        '/once',
        restarted.http.collector.http({ action: 'synthetic.once' }),
        (c) => c.json({ ok: true }),
      );
      restarted.app.addRoutes(defineApiRoutes(() => next));
      await restarted.http.verify(async () => {
        await restarted.app.fetch(new Request('http://localhost/probe'));
      });
      await restarted.readiness.start(restarted.initial);
      await restarted.app.fetch(new Request('http://localhost/api/once'));
      expect(
        (
          await f.store.query(f.scope, { store: 'main', pageSize: 100 })
        ).items.filter((e) => e.action === 'synthetic.once'),
      ).toHaveLength(1);
      await restarted.http.dispose();
      restarted.runtime.dispose();
      await restarted.app.shutdown();
    });

    it('real host Queue job factory dispatches, retries, rejects unknown binding and drains', async () => {
      const f = await fixture();
      const s = await setup(f);
      const queue = createQueueManager(createSyncQueueConfig(), {
        database: f.manager,
        jobFactory: (JobClass) => new JobClass({ database: f.manager }),
      });
      cleanups.push(() => queue.close());
      const resources = createAuditRetentionQueueResources({
        database: f.manager,
        queue,
        binding: f.store.binding,
        service: s.retention,
      });
      expect(() =>
        createAuditRetentionQueueResources({
          database: f.manager,
          queue,
          binding: f.store.binding,
          service: s.retention,
        }),
      ).toThrow();
      await resources.dispatch();
      await resources.dispatch();
      expect(
        (
          await f.store.query(f.scope, { store: 'main', pageSize: 100 })
        ).items.filter((e) => e.action === 'audit.cleanup'),
      ).toHaveLength(2);
      await queue.dispatch(AuditRetentionJob, {
        binding: 'untrusted-other-app',
        referenceTime: new Date().toISOString(),
        expectedRevision: 1,
      });
      expect(
        (
          await f.store.query(f.scope, { store: 'main', pageSize: 100 })
        ).items.filter((e) => e.action === 'audit.cleanup'),
      ).toHaveLength(2);
      const unknown = new AuditRetentionJob({ database: f.manager });
      Object.defineProperty(unknown, 'payload', {
        value: {
          binding: 'untrusted-other-app',
          referenceTime: new Date().toISOString(),
          expectedRevision: 1,
        },
      });
      await expect(unknown.execute()).rejects.toMatchObject({
        code: 'AUDIT_NOT_READY',
      });
      await resources.dispose();
      await expect(resources.dispatch()).rejects.toThrow();
      const next = new AuditRetentionService({
        connection: f.connection,
        store: f.store,
        configurationStore: f.store,
        settings: s.settings,
        health: s.health,
      });
      const rebound = createAuditRetentionQueueResources({
        database: f.manager,
        queue,
        binding: f.store.binding,
        service: next,
      });
      await rebound.dispatch();
      await rebound.dispose();
      expect(
        (
          await f.store.query(f.scope, { store: 'main', pageSize: 100 })
        ).items.filter((e) => e.action === 'audit.cleanup'),
      ).toHaveLength(3);
      await s.http.dispose();
      s.runtime.dispose();
      await s.app.shutdown();
    });
    it('existing Schedule triggers a host tick, which dispatches a fresh cleanup plan', async () => {
      const f = await fixture();
      const s = await setup(f);
      class HostRetentionTick extends Job<Record<string, never>> {
        static options: JobOptions = {
          name: 'synthetic-g12-host-tick',
          queue: 'default',
        };
        constructor(private readonly tick: () => Promise<void>) {
          super();
        }
        async execute(): Promise<void> {
          await this.tick();
        }
      }
      let dispatch: () => Promise<void> = () =>
        Promise.reject(new Error('Host tick is not bound.'));
      const queue = createQueueManager(
        {
          default: 'fake',
          connections: { fake: { driver: 'fake' } },
          jobs: { autoLoad: false, locations: [] },
          worker: {
            queues: ['default'],
            concurrency: 1,
            idleDelay: '10ms',
            gracefulShutdown: true,
          },
        },
        {
          database: f.manager,
          jobFactory: (JobClass) =>
            JobClass === HostRetentionTick
              ? new HostRetentionTick(() => dispatch())
              : new JobClass({ database: f.manager }),
        },
      );
      cleanups.push(() => queue.close());
      await queue.init();
      queue.registerJob(HostRetentionTick);
      const resources = createAuditRetentionQueueResources({
        database: f.manager,
        queue,
        binding: f.store.binding,
        service: s.retention,
      });
      dispatch = () => resources.dispatch();
      const scheduleId = 'synthetic-g12-' + f.databaseName;
      await HostRetentionTick.schedule({}).id(scheduleId).every('1d').run();
      const schedule = await Schedule.find(scheduleId);
      expect(schedule).not.toBeNull();
      const adapter = QueueManager.use();
      const worker = new Worker({
        default: 'fake',
        adapters: { fake: () => adapter },
        autoLoadJobs: false,
        locations: [],
        worker: { idleDelay: '10ms', concurrency: 1, gracefulShutdown: true },
        jobFactory: (JobClass) =>
          JobClass === HostRetentionTick
            ? new HostRetentionTick(() => dispatch())
            : new JobClass({ database: f.manager }),
      });
      const working = worker.start(['default']);
      try {
        await schedule?.trigger();
        await expect
          .poll(
            async () =>
              (
                await f.store.query(f.scope, { store: 'main', pageSize: 100 })
              ).items.filter((e) => e.action === 'audit.cleanup').length,
          )
          .toBe(1);
        // The next tick reads the latest policy instead of reusing the previous job payload.
        const current = await s.settings.get(f.scope);
        await s.settings.update(f.scope, {
          expectedRevision: current.revision,
          settings: { ...current, enabled: false },
          confirmRetentionReduction: false,
        });
        await schedule?.trigger();
        await expect.poll(() => s.retention.observe().state).toBe('disabled');
        expect(
          (
            await f.store.query(f.scope, { store: 'main', pageSize: 100 })
          ).items.filter((e) => e.action === 'audit.cleanup'),
        ).toHaveLength(1);
        expect(s.retention.observe().state).toBe('disabled');
        await schedule?.pause();
        expect((await Schedule.find(scheduleId))?.status).toBe('paused');
      } finally {
        await worker.stop();
        await working;
        await resources.dispose();
        await schedule?.delete();
        await s.http.dispose();
        s.runtime.dispose();
        await s.app.shutdown();
      }
    });

    it('actual Queue retry reuses its original plan after a rolled-back failed batch', async () => {
      const f = await fixture();
      const s = await setup(f);
      await f.recorder.record({
        action: 'synthetic.expired',
        outcome: 'success',
      });
      await auditRaw(
        f.connection,
        'UPDATE "auditEvents" SET "occurredAt" = ?',
        ['2000-01-01T00:00:00.000Z'],
      );
      const started = Date.now();
      const clock = vi.spyOn(Date, 'now').mockReturnValue(started);
      const execute = vi.spyOn(s.retention, 'run');
      const append = f.store.appendWithLimits.bind(f.store);
      let failed = false;
      vi.spyOn(f.store, 'appendWithLimits').mockImplementation(
        async (event, options, limits) => {
          if (event.action === 'audit.cleanup.batch' && !failed) {
            failed = true;
            clock.mockReturnValue(started + 86400000);
            throw new AuditError('AUDIT_WRITE_FAILED');
          }
          return append(event, options, limits);
        },
      );
      const queue = createQueueManager(
        { ...createSyncQueueConfig(), retry: { maxRetries: 1 } },
        {
          database: f.manager,
          jobFactory: (JobClass) => new JobClass({ database: f.manager }),
        },
      );
      cleanups.push(() => queue.close());
      const resources = createAuditRetentionQueueResources({
        database: f.manager,
        queue,
        binding: f.store.binding,
        service: s.retention,
      });
      await resources.dispatch();
      expect(execute).toHaveBeenCalledTimes(2);
      expect(execute.mock.calls[0][0]).toEqual(execute.mock.calls[1][0]);
      expect(s.retention.observe().lastRun).toMatchObject({
        deleted: 1,
        status: 'completed',
      });
      expect(
        (
          await f.store.query(f.scope, { store: 'main', pageSize: 100 })
        ).items.filter((e) => e.action === 'audit.cleanup.batch'),
      ).toHaveLength(1);
      await resources.dispose();
      await s.http.dispose();
      s.runtime.dispose();
      await s.app.shutdown();
    });
    it('rejected host drain still waits for accepted HTTP work before database provider shutdown', async () => {
      const f = await fixture();
      const s = await setup(f);
      const entered = deferred();
      const release = deferred();
      const fail = deferred();
      const failureEntered = deferred();
      let persistedActions: string[] = [];
      let destroyed = false;
      let accepting = true;
      let settled = false;
      const active: Promise<Response>[] = [];
      const lifecycle = createAuditLifecycleResources({
        stopAccepting: () => {
          accepting = false;
          throw new Error('Synthetic admission shutdown failure.');
        },
        drainHost: async () => {
          await Promise.all(active);
        },
        retention: [s.retention],
        queues: [],
        http: [s.http],
        database: [],
        catalog: s.catalog,
        runtime: s.runtime,
      });
      class DatabaseOwner extends ServiceProvider {
        readonly name: string = 'synthetic-g12-database-owner';
        async shutdown(): Promise<void> {
          persistedActions = (
            await f.store.query(f.scope, { store: 'main', pageSize: 100 })
          ).items.map((event) => event.action);
          destroyed = true;
          await f.manager.destroy();
        }
      }
      class AuditOwner extends ServiceProvider {
        readonly name: string = 'synthetic-g12-audit-owner';
        async shutdown(): Promise<void> {
          await lifecycle.dispose();
        }
      }
      s.app.addServiceProvider(DatabaseOwner);
      s.app.addServiceProvider(AuditOwner);
      const router = new Hono();
      router.get(
        '/slow',
        s.http.collector.http({ action: 'synthetic.slow' }),
        async (c) => {
          entered.resolve();
          await release.promise;
          await f.recorder.record({
            action: 'synthetic.ending',
            outcome: 'success',
          });
          return c.text('ok');
        },
      );
      router.get('/fail', async () => {
        failureEntered.resolve();
        await fail.promise;
        throw new Error('Synthetic request failure.');
      });
      s.app.addRoutes(defineApiRoutes(() => router));
      s.app.addHttpMiddleware({
        name: 'synthetic-error-rejection',
        register(router) {
          router.onError(() => {
            throw new Error('Synthetic final error.');
          });
        },
      });
      await s.http.verify(async () => {
        await s.app.fetch(new Request('http://localhost/probe'));
      });
      await s.readiness.start(s.initial);
      const request = (path: string): Promise<Response> => {
        if (!accepting) throw new Error('Admission closed.');
        const task = Promise.resolve(
          s.app.fetch(new Request('http://localhost/api' + path)),
        );
        active.push(task);
        void task.catch(() => undefined);
        return task;
      };
      const slow = request('/slow');
      await entered.promise;
      const broken = request('/fail');
      await failureEntered.promise;
      const closing = s.app.shutdown();
      void closing.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      fail.resolve();
      await expect(broken).rejects.toThrow('Synthetic final error.');
      try {
        await new Promise<void>((done) => setImmediate(done));
        expect(
          (await s.app.fetch(new Request('http://localhost/api/slow'))).status,
        ).toBe(503);
        expect(settled).toBe(false);
        expect(destroyed).toBe(false);
      } finally {
        release.resolve();
      }
      expect((await slow).status).toBe(200);
      await expect(closing).rejects.toThrow();
      expect(accepting).toBe(false);
      expect(destroyed).toBe(true);
      expect(
        persistedActions.filter((action) => action === 'synthetic.slow'),
      ).toHaveLength(1);
      expect(
        persistedActions.filter((action) => action === 'synthetic.ending'),
      ).toHaveLength(1);
    });
  });
