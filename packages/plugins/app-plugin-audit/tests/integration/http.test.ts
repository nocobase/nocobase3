import { AuditCaptureCatalog } from '../../server/capture-catalog.js';
import { createCaptureServices } from '../helpers/capture-services.js';
import type { AuditEventDto } from '../../server/contracts.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Application } from '@nocobase/app-server/application';
import {
  AppConfig,
  appConfig,
  createConfigPaths,
} from '@nocobase/app-server/config';
import {
  defineApiRoutes,
  defineHttpMiddleware,
} from '@nocobase/app-server/router';
import { createPublicBasePathAdapter } from '@nocobase/app-server/runtime';
import { AuditHttpCollector } from '../../server/http.js';
import { createAuditHttpResources } from '../../server/providers/http.js';
import { NodeAuditScopeCarrier } from '../../server/scope.js';
import { TrustedAuditRuntime } from '../../server/runtime.js';

import {
  createPortableFixture,
  auditRaw,
  auditRows,
  dialects,
  type PortableFixture,
} from '../helpers/database-fixtures.js';

function uniqueEvent(
  events: readonly AuditEventDto[],
  predicate: (event: AuditEventDto) => boolean,
): AuditEventDto {
  const matches = events.filter(predicate);
  expect(matches).toHaveLength(1);
  return matches[0];
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
async function setup(
  f: PortableFixture,
  routes: (collector: AuditHttpCollector, runtime: TrustedAuditRuntime) => Hono,
  outer?: (app: Application) => void,
) {
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
  const app = new Application<
    import('@nocobase/app-server/config').AppConfigAccessor
  >({
    config,
    paths: createConfigPaths({ rootDir: '/synthetic/http-audit' }),
    websocket: () => async () => null,
  });
  const carrier = new NodeAuditScopeCarrier(f.scope.appId);
  const runtime = new TrustedAuditRuntime({
    appId: f.scope.appId,
    securityScope: f.scope.securityScope,
    carrier,
    bind: () => f.recorder,
    diagnostic: () => undefined,
  });
  const { health, catalog, readiness, settings } = createCaptureServices([f]);
  const initial = await settings.initialize(f.scope);
  const resources = createAuditHttpResources({
    application: app,
    runtime,
    settings,
    stores: [f.store],
    health,
    catalog,
    connections: [f.connection],
  });
  outer?.(app);
  app.addRoutes(defineApiRoutes(() => routes(resources.collector, runtime)));
  await resources.verify(async () => {
    const response = await app.fetch(new Request('http://localhost/__probe'));
    expect(response.status).toBe(404);
  });
  await readiness.start(initial);
  cleanups.push(async () => {
    await resources.dispose();
    runtime.dispose();
    await app.shutdown();
  });
  return {
    app,
    collector: resources.collector,
    runtime,
    health,
    settings,
    resources,
    request: async (path: string, init?: RequestInit) =>
      app.fetch(new Request('http://localhost/api' + path, init)),
    events: async () =>
      (await f.store.query(f.scope, { store: 'main', pageSize: 100 })).items,
  };
}
for (const dialect of dialects)
  describe('real HTTP ' + dialect, () => {
    async function fixture() {
      const f = await createPortableFixture(dialect);
      cleanups.push(f.cleanup);
      return f;
    }
    it('persists the status matrix once per request and ignores client idempotency', async () => {
      const f = await fixture();
      let requestId: string | undefined;
      const s = await setup(f, (audit, runtime) => {
        const router = new Hono();
        router.get(
          '/status/:status',
          audit.http({
            action: 'orders.inspect',
            titleKey: 'orders.inspect.title',
          }),
          (c) => {
            requestId = runtime.current().requestId;
            return c.text(
              'synthetic',
              Number(c.req.param('status')) as ContentfulStatusCode,
            );
          },
        );
        router.get(
          '/rejected',
          audit.http({ action: 'orders.approve' }),
          (c) => {
            audit.markHttpResult(c, {
              outcome: 'denied',
              reasonCode: 'ORDER_NOT_APPROVABLE',
            });
            return c.text('business denial');
          },
        );
        return router;
      });
      const cases = [
        [200, 'success'],
        [201, 'success'],
        [202, 'accepted'],
        [400, 'failed'],
        [401, 'denied'],
        [403, 'denied'],
        [409, 'failed'],
        [500, 'failed'],
        [302, 'unknown'],
      ] as const;
      for (const [status, outcome] of cases) {
        expect(
          (
            await s.request('/status/' + status, {
              headers: {
                'Idempotency-Key': 'same-client-key',
                'X-Actor-Id': 'forged-user',
              },
            })
          ).status,
        ).toBe(status);
        const events = await s.events();
        expect(
          uniqueEvent(events, (event) => event.requestId === requestId),
        ).toMatchObject({
          kind: 'request',
          action: 'orders.inspect',
          outcome,
          actor: { type: 'anonymous' },
          http: { httpStatus: status, routePattern: '/api/status/:status' },
        });
      }
      await s.request('/status/200', {
        headers: { 'Idempotency-Key': 'same-client-key' },
      });
      await s.request('/rejected');
      const events = await s.events();
      expect(events).toHaveLength(11);
      expect(new Set(events.map((e) => e.requestId)).size).toBe(11);
      expect(
        uniqueEvent(events, (event) => event.action === 'orders.approve'),
      ).toMatchObject({
        outcome: 'denied',
        reasonCode: 'ORDER_NOT_APPROVABLE',
      });
    });

    it('observes outer post-response mutation and nested onError, with no raw reason', async () => {
      const f = await fixture();
      const s = await setup(
        f,
        (audit) => {
          const router = new Hono();
          router.onError((_error, c) => c.text('handled', 409));
          router.get('/error', audit.http({ action: 'orders.error' }), () => {
            throw new Error('SECRET_error_password');
          });
          router.get('/late', audit.http({ action: 'orders.late' }), (c) =>
            c.text('business result', 201),
          );
          return router;
        },
        (app) =>
          app.addHttpMiddleware(
            defineHttpMiddleware({
              name: 'late',
              register(router) {
                router.use('*', async (c, next) => {
                  await next();
                  if (c.req.path.endsWith('/late'))
                    c.res = c.text('final response', 403);
                });
              },
            }),
          ),
      );
      expect((await s.request('/error')).status).toBe(409);
      expect(
        uniqueEvent(
          await s.events(),
          (event) => event.action === 'orders.error',
        ),
      ).toMatchObject({
        outcome: 'failed',
        reasonCode: 'HTTP_HANDLER_ERROR',
        http: { httpStatus: 409 },
      });
      expect(JSON.stringify(await s.events())).not.toContain('SECRET');
      const response = await s.request('/late');
      expect(response.status).toBe(403);
      expect(await response.text()).toBe('final response');
      expect(
        uniqueEvent(
          await s.events(),
          (event) => event.action === 'orders.late',
        ),
      ).toMatchObject({
        outcome: 'denied',
        http: { httpStatus: 403 },
      });
    });

    it('parent rejection records only the actual access boundary', async () => {
      const f = await fixture();
      let executed = 0;
      const s = await setup(
        f,
        (audit) => {
          const router = new Hono();
          router.get(
            '/secret',
            audit.http({ action: 'orders.secret' }),
            (c) => {
              executed++;
              return c.text('never');
            },
          );
          return router;
        },
        (app) =>
          app.addHttpMiddleware(
            defineHttpMiddleware({
              name: 'parent-auth',
              register(router) {
                router.use('/api/*', async (c) =>
                  c.text('authentication required', 401),
                );
              },
            }),
          ),
      );
      expect((await s.request('/secret')).status).toBe(401);
      expect(executed).toBe(0);
      expect(await s.events()).toMatchObject([
        {
          kind: 'request',
          action: 'authentication.access',
          outcome: 'denied',
          captureWarnings: ['route-not-executed'],
        },
      ]);
      expect(await s.events()).toHaveLength(1);
    });

    it('does not clone or consume downloads, SSE or a large request body', async () => {
      const f = await fixture();
      let pulls = 0;
      let stream!: ReadableStream<Uint8Array>;
      const s = await setup(f, (audit) => {
        const router = new Hono();
        router.post('/stream', audit.http({ action: 'files.download' }), () => {
          stream = new ReadableStream(
            {
              pull() {
                pulls++;
              },
            },
            { highWaterMark: 0 },
          );
          return new Response(stream, {
            headers: { 'Content-Type': 'text/event-stream' },
          });
        });
        return router;
      });
      const input = new Request('http://localhost/api/stream', {
        method: 'POST',
        body: 'SECRET_large_body'.repeat(100000),
      });
      const clone = vi.spyOn(input, 'clone');
      const text = vi.spyOn(input, 'text');
      const json = vi.spyOn(input, 'json');
      const response = await s.app.fetch(input);
      expect(response.body).toBe(stream);
      expect(pulls).toBe(0);
      expect(input.bodyUsed).toBe(false);
      expect(clone).not.toHaveBeenCalled();
      expect(text).not.toHaveBeenCalled();
      expect(json).not.toHaveBeenCalled();
      expect((await s.events())[0]).toMatchObject({
        action: 'files.download',
        outcome: 'success',
      });
      expect(JSON.stringify(await s.events())).not.toContain('SECRET');
      await response.body?.cancel();
    });

    it('committed business survives observation storage failure with degraded health', async () => {
      const f = await fixture();
      await auditRaw(
        f.connection,
        'CREATE TABLE "http_business" ("id" INTEGER PRIMARY KEY)',
      );
      const s = await setup(f, (audit) => {
        const router = new Hono();
        router.post(
          '/commit',
          audit.http({ action: 'orders.approve' }),
          async (c) => {
            await auditRaw(
              f.connection,
              'INSERT INTO "http_business" ("id") VALUES (1)',
            );
            await auditRaw(f.connection, 'DROP TABLE "auditEvents"');
            return c.text('approved', 201);
          },
        );
        return router;
      });
      const response = await s.request('/commit', { method: 'POST' });
      expect(response.status).toBe(201);
      expect(await response.text()).toBe('approved');
      expect(s.health.get().state).toBe('degraded');
      const result = await auditRows(
        f.connection,
        'SELECT * FROM "http_business"',
      );
      expect(result).toHaveLength(1);
    });

    it('captures authenticated scope before callbacks unwind and rejects foreign request context', async () => {
      const f = await fixture();
      let retained: Context | undefined;
      const s = await setup(f, (audit, runtime) => {
        const router = new Hono();
        router.use('/identity/:id', async (c, next) =>
          runtime.runAuthenticated(
            {
              actor: { type: 'user', id: c.req.param('id') },
              roleIds: ['reader'],
            },
            async () => {
              audit.captureScope(c);
              retained = c;
              await next();
            },
          ),
        );
        router.get(
          '/identity/:id',
          audit.http({ action: 'identity.read' }),
          async (c) => {
            await Promise.resolve();
            return c.text('ok');
          },
        );
        router.get(
          '/foreign',
          audit.http({ action: 'identity.foreign' }),
          (c) => {
            if (retained)
              expect(() => audit.captureScope(retained!)).not.toThrow();
            return c.text('ok');
          },
        );
        router.get('/logout', audit.http({ action: 'identity.logout' }), (c) =>
          runtime.runAuthenticated(
            { actor: { type: 'user', id: 'logout-user' } },
            () => {
              audit.captureScope(c);
              return runtime.runAnonymous(() => c.text('logged out'));
            },
          ),
        );
        return router;
      });
      await Promise.all(
        ['a', 'b', 'c'].map((id) => s.request('/identity/' + id)),
      );
      const events = await s.events();
      expect(events.map((e) => e.actor.id).sort()).toEqual(['a', 'b', 'c']);
      for (const e of events) expect(e.initiator).toEqual(e.actor);
      await s.request('/logout');
      expect(
        uniqueEvent(
          await s.events(),
          (event) => event.action === 'identity.logout',
        ),
      ).toMatchObject({
        actor: { type: 'user', id: 'logout-user' },
        initiator: { type: 'user', id: 'logout-user' },
      });
      await s.request('/foreign');
      expect(
        uniqueEvent(
          await s.events(),
          (event) => event.action === 'identity.foreign',
        ).actor.type,
      ).toBe('anonymous');
    });

    it('extractor failures preserve safe minimum and invalid declarations fail at construction', async () => {
      const f = await fixture();
      const s = await setup(f, (audit) => {
        const router = new Hono();
        expect(() => audit.http({ action: '' })).toThrow();
        router.get(
          '/bad',
          audit.http({
            action: 'orders.bad',
            target: () => {
              throw new Error('SECRET');
            },
            details: () => ({ huge: 'SECRET'.repeat(20000) }),
          }),
          (c) => c.text('ok'),
        );
        return router;
      });
      await s.request('/bad');
      const events = await s.events();
      expect(events[0]).toMatchObject({
        outcome: 'success',
        captureWarnings: [
          'target-extraction-failed',
          'details-extraction-failed',
        ],
      });
      expect(events[0].details).toBeUndefined();
      expect(events[0].target).toBeUndefined();
      expect(JSON.stringify(events)).not.toContain('SECRET');
    });

    it('mounted redirects retain actual status and one finalization', async () => {
      const f = await fixture();
      const s = await setup(f, (audit) => {
        const router = new Hono();
        router.get(
          '/redirect',
          audit.http({ action: 'navigation.redirect' }),
          (c) => c.redirect('/login', 302),
        );
        return router;
      });
      const mounted = createPublicBasePathAdapter(s.app, '/mounted');
      const response = await mounted.fetch(
        new Request('http://localhost/mounted/api/redirect'),
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toBe('/mounted/login');
      expect(await s.events()).toMatchObject([
        { outcome: 'unknown', http: { httpStatus: 302 } },
      ]);
      expect(await s.events()).toHaveLength(1);
    });
    it('awaits one controlled append and drains requests already in progress on disposal', async () => {
      const f = await fixture();
      let entered!: () => void;
      let release!: () => void;
      let context!: Context;
      const entering = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const s = await setup(f, (audit) => {
        const router = new Hono();
        router.get(
          '/wait',
          audit.http({ action: 'orders.wait' }),
          async (c) => {
            context = c;
            entered();
            await gate;
            return c.text('ok');
          },
        );
        return router;
      });
      const original = f.store.appendWithLimits.bind(f.store);
      let appendRelease!: () => void;
      let appendEntered!: () => void;
      const appendGate = new Promise<void>((resolve) => {
        appendRelease = resolve;
      });
      const appending = new Promise<void>((resolve) => {
        appendEntered = resolve;
      });
      const append = vi
        .spyOn(f.store, 'appendWithLimits')
        .mockImplementation(async (...args) => {
          appendEntered();
          await appendGate;
          return original(...args);
        });
      let finished = false;
      const request = s.request('/wait').then((response) => {
        finished = true;
        return response;
      });
      await entering;
      let disposed = false;
      const disposal = s.resources.dispose().then(() => {
        disposed = true;
      });
      await Promise.resolve();
      expect(disposed).toBe(false);
      release();
      await appending;
      const duplicate = s.collector.finalize(context);
      expect(finished).toBe(false);
      expect(append).toHaveBeenCalledTimes(1);
      appendRelease();
      await duplicate;
      expect((await request).status).toBe(200);
      await disposal;
      expect(disposed).toBe(true);
      expect(await s.events()).toHaveLength(1);
      expect(append).toHaveBeenCalledTimes(1);
    });

    it('retains request entry policy revision across a concurrent settings update', async () => {
      const f = await fixture();
      let entered!: () => void;
      let release!: () => void;
      const entering = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const s = await setup(f, (audit) => {
        const router = new Hono();
        router.get(
          '/policy',
          audit.http({ action: 'orders.policy' }),
          async (c) => {
            entered();
            await gate;
            return c.text('ok');
          },
        );
        return router;
      });
      const request = s.request('/policy');
      await entering;
      const current = await s.settings.get(f.scope);
      await s.settings.update(f.scope, {
        expectedRevision: current.revision,
        settings: { ...current, enabled: false },
        confirmRetentionReduction: false,
      });
      release();
      await request;
      await s.request('/policy');
      const events = (await s.events()).filter(
        (event) => event.kind === 'request',
      );
      expect(events).toHaveLength(1);
      expect(events[0].policyVersion).toBe(current.revision);
    });

    it('trusted scope survives nested actors and thrown handlers while cross-request capture is rejected', async () => {
      const f = await fixture();
      let first!: Context;
      let entered!: () => void;
      let release!: () => void;
      const entering = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const s = await setup(f, (audit, runtime) => {
        const router = new Hono();
        router.onError((_error, c) => c.text('safe', 500));
        router.get(
          '/first',
          audit.http({ action: 'orders.first' }),
          async (c) => {
            first = c;
            entered();
            await gate;
            return c.text('ok');
          },
        );
        router.get('/cross', audit.http({ action: 'orders.cross' }), (c) => {
          expect(() => audit.captureScope(first)).toThrow();
          return c.text('ok');
        });
        router.get('/nested', audit.http({ action: 'orders.nested' }), (c) =>
          runtime.runAuthenticated(
            { actor: { type: 'user', id: 'origin' } },
            () =>
              runtime.runChild(
                { actor: { type: 'workflow', id: 'run' } },
                () => {
                  audit.captureScope(c);
                  throw new Error('SECRET_original');
                },
              ),
          ),
        );
        return router;
      });
      const request = s.request('/first');
      await entering;
      await s.request('/cross');
      release();
      await request;
      await s.request('/nested');
      const event = uniqueEvent(
        await s.events(),
        (item) => item.action === 'orders.nested',
      );
      expect(event).toMatchObject({
        actor: { type: 'workflow', id: 'run' },
        initiator: { type: 'user', id: 'origin' },
        outcome: 'failed',
        http: { httpStatus: 500 },
      });
      expect(JSON.stringify(event)).not.toContain('SECRET');
    });
    it('releases resources if the final Hono error handler throws without a response', async () => {
      const f = await fixture();
      const s = await setup(
        f,
        (audit) => {
          const router = new Hono();
          router.get('/broken', audit.http({ action: 'orders.broken' }), () => {
            throw new Error('original');
          });
          return router;
        },
        (app) =>
          app.addHttpMiddleware(
            defineHttpMiddleware({
              name: 'broken-on-error',
              register(router) {
                router.onError(() => {
                  throw new Error('handler failed');
                });
              },
            }),
          ),
      );
      await expect(s.request('/broken')).rejects.toThrow('handler failed');
      await s.resources.dispose();
      expect(s.health.get().state).toBe('degraded');
      expect(await s.events()).toHaveLength(0);
    });
    it('root onError transformed success codes never turn an exception into request success', async () => {
      const f = await fixture();
      let requestId: string | undefined;
      const s = await setup(
        f,
        (audit, runtime) => {
          const router = new Hono();
          router.get(
            '/root/:status',
            audit.http({ action: 'orders.root-error' }),
            (c) => {
              requestId = runtime.current().requestId;
              audit.markHttpResult(c, { outcome: 'success' });
              return c.text('early');
            },
          );
          return router;
        },
        (app) =>
          app.addHttpMiddleware(
            defineHttpMiddleware({
              name: 'late-root-error',
              register(router) {
                router.onError((_error, c) =>
                  c.text(
                    'handled',
                    Number(
                      c.req.path.split('/').at(-1),
                    ) as ContentfulStatusCode,
                  ),
                );
                router.use('/api/root/*', async (_c, next) => {
                  await next();
                  throw new Error('SECRET_late');
                });
              },
            }),
          ),
      );
      for (const status of [200, 202, 302, 403]) {
        const response = await s.request('/root/' + status);
        expect(response.status).toBe(status);
        expect(
          uniqueEvent(
            await s.events(),
            (event) => event.requestId === requestId,
          ),
        ).toMatchObject({
          outcome: status === 403 ? 'denied' : 'failed',
          reasonCode: 'HTTP_HANDLER_ERROR',
          http: { httpStatus: status },
        });
      }
    });

    it('same runtime App isolates security boundaries and rejects a second collector installation', async () => {
      const f = await fixture();
      const s = await setup(f, (audit) => {
        const router = new Hono();
        router.get('/ok', audit.http({ action: 'orders.ok' }), (c) =>
          c.text('ok'),
        );
        return router;
      });
      await expect(
        s.collector.verifyHostProbe(async () => undefined),
      ).rejects.toMatchObject({ code: 'AUDIT_NOT_READY' });
      expect(() =>
        createAuditHttpResources({
          application: s.app,
          runtime: s.runtime,
          settings: s.settings,
          stores: [f.store],
          health: s.health,
          catalog: new AuditCaptureCatalog(),
          connections: [f.connection],
        }),
      ).toThrow();
      await s.request('/ok');
      expect(await s.events()).toHaveLength(1);
    });
  });
