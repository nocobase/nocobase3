import { objectProvider } from '@nocobase/config/providers/object';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import * as nodeServer from '../src/node/server.js';

import { Application } from '../src/application/index.js';
import {
  AppConfig,
  type AppConfigAccessor,
  type AppPaths,
} from '../src/config/index.js';
import {
  createStandaloneServer,
  defineStandaloneServer,
  type StandaloneApplicationDefinition,
  type StandaloneAppScope,
} from '../src/node/index.js';
import { defineServerPlugins } from '../src/plugins/index.js';
import {
  defineAppRuntime,
  resolveAppRuntime,
  startApplicationInScope,
  type AppRuntimeDefinition,
  type AppScope,
} from '../src/runtime/index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('standalone runtime server', () => {
  it('applies proxy configuration through start as well as create', async () => {
    let started: nodeServer.ClosableNodeAppServer | undefined;
    const start = vi
      .spyOn(nodeServer, 'startNodeAppServer')
      .mockImplementation(async (app) => {
        started = app;
        return {} as nodeServer.NodeAppHttpServer;
      });
    try {
      const standalone = defineStandaloneServer({
        ...createStandaloneDefinition(createAppRoot(), '/main'),
        proxy: () => ({
          match: (pathname) => pathname.startsWith('/crm/'),
          target: () => null,
        }),
      });
      standalone.start();
      await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
      expect(
        (await started!.fetch(new Request('http://localhost/crm/'))).status,
      ).toBe(503);
      expect(
        (await started!.fetch(new Request('http://localhost/main/status')))
          .status,
      ).toBe(200);
    } finally {
      await started?.close();
      start.mockRestore();
    }
  });

  it('disposes the application if proxy configuration fails', async () => {
    const dispose = vi.fn();
    const error = new Error('Invalid proxy configuration');
    await expect(
      createStandaloneServer({
        ...createStandaloneDefinition(createAppRoot(), '/main', (scope) =>
          scope.registerDisposer('fixture', dispose),
        ),
        proxy: () => {
          throw error;
        },
      }),
    ).rejects.toBe(error);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('composes a mounted application with lifecycle and listen metadata', async () => {
    const rootDir = createAppRoot();
    let receivedViteDevUrl: string | undefined;
    const definition = createStandaloneDefinition(rootDir, '/main', (scope) => {
      receivedViteDevUrl = scope.env?.APP_VITE_DEV_URL;
    });

    const server = await createStandaloneServer({
      ...definition,
      env: { APP_VITE_DEV_URL: 'http://127.0.0.1:5173' },
      viteDevUrl: false,
    });

    const application = server.application;
    const shutdown = vi.spyOn(application, 'shutdown');
    expect(server).not.toBe(application);
    expect(server.application).toBe(application);
    expect(server.listenOptions).toEqual({
      hostname: '127.0.0.1',
      port: 13000,
      startLog: false,
    });
    expect(server.signal.aborted).toBe(false);
    expect(receivedViteDevUrl).toBe('false');

    const response = await server.fetch(
      new Request('http://localhost/main/status'),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ path: '/status' });

    await server.close();
    await server.close();
    expect(server.signal.aborted).toBe(true);
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('always returns an independent wrapper when the base path is empty', async () => {
    const definition = createStandaloneDefinition(createAppRoot(), '');
    const server = await createStandaloneServer({
      ...definition,
      basePath: '',
    });

    expect(server).not.toBe(server.application);
    expect('close' in server.application).toBe(false);
    await server.close();
  });

  it('uses the definition root and supports runtime overrides through the builder', async () => {
    const rootDir = createAppRoot();
    const standalone = defineStandaloneServer(
      createStandaloneDefinition(rootDir, '/main'),
    );

    const server = await standalone.create({ basePath: '/custom' });

    expect(server.application.publicBasePath).toBe('/custom');
    await server.close();
  });

  it('destroys the standalone scope when application creation fails', async () => {
    const rootDir = createAppRoot();
    const startupError = new Error('application failed to start');
    let capturedScope: StandaloneAppScope | undefined;
    const dispose = vi.fn();
    const baseDefinition = createStandaloneDefinition(rootDir, '/main');
    const definition: StandaloneApplicationDefinition = {
      ...baseDefinition,
      createServer: (scope) => {
        capturedScope = scope as StandaloneAppScope;
        scope.registerDisposer('test-resource', dispose);
        return Promise.reject(startupError);
      },
    };

    const creation = createStandaloneServer(definition);

    await expect(creation).rejects.toBe(startupError);
    expect(capturedScope?.signal.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledOnce();
  });
});

function createStandaloneDefinition(
  rootDir: string,
  publicBasePath: string,
  onCreate: (scope: AppScope) => void = () => undefined,
): StandaloneApplicationDefinition {
  const appRuntime = createDefinition(publicBasePath);
  return {
    rootDir,
    appRuntime,
    createServer: async (scope) => {
      onCreate(scope);
      const runtime = await resolveAppRuntime(appRuntime, scope);
      const app = createApplication(runtime.config, runtime.paths);
      return startApplicationInScope(scope, app);
    },
  };
}

function createDefinition(_publicBasePath: string): AppRuntimeDefinition {
  return defineAppRuntime({
    createAppConfig: (context) => {
      const config = new AppConfig();
      config.load(
        objectProvider({
          app: {
            name: context.routing.name,
            publicBasePath: context.routing.publicBasePath,
            internalBasePath: context.routing.internalBasePath,
            publicApiUrl: context.routing.publicBasePath + '/api',
          },
          server: { host: '127.0.0.1', port: 13000, startLog: false },
        }),
      );
      return config;
    },
    plugins: defineServerPlugins([]),
    serviceProviders: [],
    routes: [],
  });
}

function createApplication(
  config: AppConfigAccessor,
  paths: AppPaths,
): Application {
  const app = new Application({
    config,
    paths,
  });
  app.addRoutes({
    scope: 'root',
    createRouter(): Hono {
      const router = new Hono();
      router.get('/status', (context) =>
        context.json({ path: context.req.path }),
      );
      return router;
    },
  });
  return app;
}

function createAppRoot(): string {
  const rootDir = mkdtempSync(
    path.join(tmpdir(), 'nocobase-standalone-runtime-'),
  );
  tempDirs.push(rootDir);
  writeFileSync(
    path.join(rootDir, 'package.json'),
    JSON.stringify({ name: '@example/standalone-runtime-test' }),
  );
  return rootDir;
}
