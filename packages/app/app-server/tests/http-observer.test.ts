import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  Application,
  type ApplicationHttpObserver,
} from '../src/application/index.js';
import {
  AppConfig,
  appConfig,
  createConfigPaths,
} from '../src/config/index.js';
import { defineApiRoutes, defineHttpMiddleware } from '../src/router/index.js';
import { createPublicBasePathAdapter } from '../src/runtime/mount.js';

async function application(): Promise<Application> {
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
  return new Application<import('../src/config/index.js').AppConfigAccessor>({
    config,
    paths: createConfigPaths({ rootDir: '/synthetic/http-audit' }),
    websocket: () => async () => null,
  });
}
function observer(
  finalize: (context: Context) => Promise<void>,
  failure: () => void = () => undefined,
): ApplicationHttpObserver {
  return {
    run: async (_context, next) => {
      await next();
    },
    finalize,
    failure,
  };
}
describe('final host boundary', () => {
  it('awaits finalizers after outer middleware response replacement and preserves body identity', async () => {
    const app = await application();
    const seen: number[] = [];
    let complete!: () => void;
    let entered!: () => void;
    const entering = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      complete = resolve;
    });
    app.addHttpObserver(
      observer(async (c) => {
        seen.push(c.res.status);
        entered();
        await gate;
      }),
    );
    let sent!: Response;
    app.addHttpMiddleware(
      defineHttpMiddleware({
        name: 'outer',
        register(router) {
          router.use('*', async (c, next) => {
            await next();
            sent = new Response('final', { status: 409 });
            c.res = sent;
          });
        },
      }),
    );
    app.addRoutes(
      defineApiRoutes(() => {
        const router = new Hono();
        router.get('/late', (c) => c.text('early', 201));
        return router;
      }),
    );
    let done = false;
    const pending = Promise.resolve(
      app.fetch(new Request('http://localhost/api/late')),
    ).then((response) => {
      done = true;
      return response;
    });
    await entering;
    expect(done).toBe(false);
    expect(seen).toEqual([409]);
    complete();
    expect((await pending).body).toBe(sent.body);
    await app.shutdown();
  });
  it('root onError after observation scope returns is still observed; diagnostics cannot rewrite response', async () => {
    const app = await application();
    let failed = 0;
    const statuses: number[] = [];
    app.addHttpObserver(
      observer(
        async (c) => {
          statuses.push(c.res.status);
          expect(c.error).toBeInstanceOf(Error);
          throw new Error('synthetic observer failure');
        },
        () => {
          failed++;
        },
      ),
    );
    app.addHttpMiddleware(
      defineHttpMiddleware({
        name: 'outer-error',
        register(router) {
          router.onError((_error, c) => c.text('root handled', 202));
          router.use('*', async (_c, next) => {
            await next();
            throw new Error('late error');
          });
        },
      }),
    );
    app.addRoutes(
      defineApiRoutes(() => {
        const router = new Hono();
        router.get('/error', (c) => c.text('early'));
        return router;
      }),
    );
    const response = await app.fetch(new Request('http://localhost/api/error'));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe('root handled');
    expect(statuses).toEqual([202]);
    expect(failed).toBe(1);
    await app.shutdown();
  });
  it('is installed ahead of provider routes and records parent denial without reaching child', async () => {
    const app = await application();
    const contexts: Context[] = [];
    let handler = false;
    app.addHttpObserver(
      observer(async (c) => {
        contexts.push(c);
      }),
    );
    app.addHttpMiddleware(
      defineHttpMiddleware({
        name: 'denial',
        register(router) {
          router.use('*', async (c) => c.text('denied', 403));
        },
      }),
    );
    app.addRoutes(
      defineApiRoutes(() => {
        const router = new Hono();
        router.get('/secret', (c) => {
          handler = true;
          return c.text('ok');
        });
        return router;
      }),
    );
    const response = await app.fetch(
      new Request('http://localhost/api/secret'),
    );
    expect(response.status).toBe(403);
    expect(handler).toBe(false);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].res).toBe(response);
    await app.shutdown();
  });
  it('isolates simultaneous invocations even with the same Request object; detach retains in-flight snapshot', async () => {
    const app = await application();
    const contexts: Context[] = [];
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entering = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const detach = app.addHttpObserver(
      observer(async (c) => {
        contexts.push(c);
      }),
    );
    let hits = 0;
    app.addRoutes(
      defineApiRoutes(() => {
        const router = new Hono();
        router.get('/wait', async (c) => {
          if (++hits === 2) entered();
          await gate;
          return c.text('ok');
        });
        return router;
      }),
    );
    const request = new Request('http://localhost/api/wait');
    const requests = [app.fetch(request), app.fetch(request)];
    await entering;
    detach();
    release();
    await Promise.all(requests);
    expect(contexts).toHaveLength(2);
    expect(contexts[0]).not.toBe(contexts[1]);
    await app.fetch(request);
    expect(contexts).toHaveLength(2);
    await app.shutdown();
  });
  it('mounted public path and a real Hono request retain final 302 status', async () => {
    const app = await application();
    const statuses: number[] = [];
    app.addHttpObserver(
      observer(async (c) => {
        statuses.push(c.res.status);
      }),
    );
    app.addRoutes(
      defineApiRoutes(() => {
        const router = new Hono();
        router.get('/redirect', (c) => c.redirect('/login'));
        return router;
      }),
    );
    const mounted = createPublicBasePathAdapter(app, '/main');
    const host = new Hono();
    host.all('*', (c) => mounted.fetch(c.req.raw));
    const response = await host.request('http://localhost/main/api/redirect');
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/main/login');
    expect(statuses).toEqual([302]);
    await app.shutdown();
  });
});
