import { describe, expect, it } from 'vitest';
import { ServiceProvider } from '@nocobase/service-provider';
import { Application } from '../src/application/index.js';
import {
  AppConfig,
  appConfig,
  createConfigPaths,
} from '../src/config/index.js';

async function fixture() {
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
  return new Application({
    config,
    paths: createConfigPaths({ rootDir: '/synthetic/g20' }),
    websocket: () => async () => null,
  });
}

describe('controlled startup HTTP probe', () => {
  it('runs the real observer boundary without allowing external traffic before readiness', async () => {
    const app = await fixture();
    const seen: number[] = [];
    app.addHttpObserver({
      run: async (_c, next) => {
        await next();
      },
      finalize: async (c) => {
        seen.push(c.res.status);
      },
      failure: () => {
        throw new Error('Unexpected failure');
      },
    });
    await expect(app.httpHost.probe()).rejects.toThrow('startup');
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entering = new Promise<void>((resolve) => {
      entered = resolve;
    });
    app.addServiceProvider(
      class extends ServiceProvider<Application> {
        override async boot(): Promise<void> {
          await expect(app.httpHost.probe()).rejects.toThrow('startup');
        }
        override async start(): Promise<void> {
          const response = await app.httpHost.probe();
          expect(response.status).toBe(204);
          expect(seen).toEqual([204]);
          entered();
          await gate;
        }
      },
    );
    let returned = false;
    const external = Promise.resolve(
      app.fetch(new Request('http://localhost/')),
    ).then((response) => {
      returned = true;
      return response;
    });
    await entering;
    expect(returned).toBe(false);
    release();
    await external;
    await expect(app.httpHost.probe()).rejects.toThrow('startup');
    expect(seen).toEqual([204, 404]);
    await app.shutdown();
  });
  it('closes the probe after a failed start and retains finalizer failure semantics', async () => {
    const app = await fixture();
    let failures = 0;
    app.addHttpObserver({
      run: async (_c, next) => {
        await next();
      },
      finalize: async () => {
        throw new Error('observation');
      },
      failure: () => {
        failures++;
      },
    });
    app.addServiceProvider(
      class extends ServiceProvider<Application> {
        override async start(): Promise<void> {
          expect((await app.httpHost.probe()).status).toBe(204);
          throw new Error('startup failure');
        }
      },
    );
    await expect(app.start()).rejects.toThrow('startup failure');
    expect(failures).toBe(1);
    await expect(app.httpHost.probe()).rejects.toThrow('startup');
    await expect(app.fetch(new Request('http://localhost/'))).rejects.toThrow(
      'startup failure',
    );
    await app.shutdown();
  });
});

it('drains accepted dispatch and finalization before provider shutdown and rejects later admission', async () => {
  const app = await fixture();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entering = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let providerClosed = false;
  app.addServiceProvider(
    class extends ServiceProvider<Application> {
      override async shutdown(): Promise<void> {
        providerClosed = true;
      }
    },
  );
  app.addHttpObserver({
    run: async (_c, next) => {
      await next();
    },
    finalize: async () => {
      entered();
      await gate;
    },
    failure: () => {
      throw new Error('unexpected');
    },
  });
  const accepted = app.fetch(
    new Request('http://localhost/.nocobase/startup-probe'),
  );
  await entering;
  const closing = app.shutdown();
  expect((await app.fetch(new Request('http://localhost/'))).status).toBe(503);
  expect(providerClosed).toBe(false);
  release();
  expect((await accepted).status).toBe(404);
  await closing;
  expect(providerClosed).toBe(true);
  await expect(app.start()).rejects.toThrow('shutting down');
});

it('tracks actual plugin registration and rejects late additions without inventing registration', async () => {
  const app = await fixture();
  expect(app.hasPlugin('@synthetic/plugin')).toBe(false);
  const { defineServerPlugin } = await import('../src/plugins/index.js');
  const definition = defineServerPlugin({ packageName: '@synthetic/plugin' });
  const plugins = {
    appPackageName: '@synthetic/app',
    plugins: [
      {
        definition,
        metadata: {
          packageName: '@synthetic/plugin',
          version: '1.0.0',
          rootDir: '/synthetic',
          jobLocations: [],
        },
      },
    ],
  };
  app.addServerPlugins(plugins);
  expect(app.hasPlugin('@synthetic/plugin')).toBe(true);
  expect(app.hasPlugin('@nocobase/app-plugin-ai-employee')).toBe(false);
  await app.start();
  expect(() =>
    app.addServerPlugins({
      ...plugins,
      plugins: [
        {
          ...plugins.plugins[0],
          definition: defineServerPlugin({ packageName: '@synthetic/late' }),
        },
      ],
    }),
  ).toThrow();
  expect(app.hasPlugin('@synthetic/late')).toBe(false);
  await app.shutdown();
});

for (const fails of [false, true])
  it(
    'drains admission during pending startup, including failure: ' + fails,
    async () => {
      const app = await fixture();
      let release!: () => void;
      let entered!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const entering = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const order: string[] = [];
      app.addServiceProvider(
        class extends ServiceProvider<Application> {
          override async boot(): Promise<void> {
            entered();
            await gate;
            if (fails) throw new Error('Synthetic boot failure.');
          }
          override async start(): Promise<void> {
            await expect(app.httpHost.probe()).rejects.toThrow('startup');
          }
          override async shutdown(): Promise<void> {
            order.push('closed');
          }
        },
      );
      app.addHttpObserver({
        run: async (_c, next) => {
          await next();
        },
        finalize: async () => {
          order.push('finalized');
        },
        failure: () => {
          throw new Error('Unexpected observer failure.');
        },
      });
      const request = Promise.resolve(
        app.fetch(new Request('http://localhost/')),
      );
      const result = request.then(
        (response) => ({ response }),
        (error) => ({ error }),
      );
      await entering;
      const closing = app.shutdown();
      expect((await app.fetch(new Request('http://localhost/'))).status).toBe(
        503,
      );
      expect(order).toEqual([]);
      release();
      const completed = await result;
      await closing;
      if (fails) {
        expect(completed).toMatchObject({
          error: { message: 'Synthetic boot failure.' },
        });
        expect(order).toEqual(['closed']);
      } else {
        expect(completed).toMatchObject({ response: { status: 404 } });
        expect(order).toEqual(['finalized', 'closed']);
      }
      await expect(app.httpHost.probe()).rejects.toThrow('startup');
    },
  );
