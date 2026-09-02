import { fileURLToPath } from 'node:url';

import { createConfigPaths } from '@nocobase/app-server/config';
import { createMigrator } from '@nocobase/db';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  createPluginContextMiddleware,
  createPluginRuntime,
  initializePluginRuntimeResources,
  waitForPluginReady,
  type PluginEnv,
} from '../server/runtime.js';
import { createTestAppDeps } from './app/test-app-deps.js';
import { createAICurrentUserMiddleware } from '../server/routes/utils.js';
describe('AI employee facade', () => {
  it('attaches a fresh request Context over one shared runtime', async () => {
    const deps = createTestAppDeps();
    initializePluginRuntimeResources(deps, { loadResources: false });
    const runtime = createPluginRuntime({ deps });
    const app = new Hono<PluginEnv>();
    const requestContexts: unknown[] = [];
    vi.spyOn(deps.auth, 'getSession').mockResolvedValue({
      session: {} as never,
      user: {
        id: 'fixture-user',
        roles: ['member'],
        isRoot: false,
      } as never,
    });
    app.use('*', createAICurrentUserMiddleware(deps.auth));
    app.use('*', createPluginContextMiddleware(runtime));
    app.get('/manager', (context) => {
      requestContexts.push(context.var.ctx);
      return context.json({
        shared: context.var.ai === runtime.ai,
        contextSharesAI: context.var.ctx.ai === runtime.ai,
        contextSharesRepositories:
          context.var.ctx.repositories === runtime.repositories,
        contextSharesLogger: context.var.ctx.logger === runtime.logger,
        currentUser: context.var.ctx.currentUser,
      });
    });

    const first = await app.request('http://localhost/manager');
    const second = await app.request('http://localhost/manager');

    expect(await first.json()).toEqual({
      shared: true,
      contextSharesAI: true,
      contextSharesRepositories: true,
      contextSharesLogger: true,
      currentUser: { id: 'fixture-user', roles: ['member'], isRoot: false },
    });
    expect(requestContexts[0]).not.toBe(requestContexts[1]);
  });

  it('uses the authenticated database user as the current user', async () => {
    const deps = createTestAppDeps();
    vi.spyOn(deps.auth, 'getSession').mockResolvedValue({
      session: {} as never,
      user: { id: 'database-user-id', username: 'nocobase' } as never,
    });
    initializePluginRuntimeResources(deps, { loadResources: false });
    const runtime = createPluginRuntime({ deps });
    const app = new Hono<PluginEnv>();
    app.use('*', createAICurrentUserMiddleware(deps.auth));
    app.use('*', createPluginContextMiddleware(runtime));
    app.get('/actor', (context) =>
      context.json({ currentUser: context.var.ctx.currentUser }),
    );

    const response = await app.request('http://localhost/actor');

    expect(await response.json()).toEqual({
      currentUser: {
        id: 'database-user-id',
        roles: ['member'],
        isRoot: false,
      },
    });
  });

  it('initializes resources without invoking database schema builders', async () => {
    const deps = createTestAppDeps();
    await deps.database.connect();
    const migrator = createMigrator({
      database: deps.database,
      packageName: '@nocobase/app-plugin-ai-employee',
      directory: fileURLToPath(
        new URL('../database/migrations', import.meta.url),
      ),
    });
    await migrator.latest();
    const createCollection = vi.spyOn(
      deps.database.builder(),
      'createCollection',
    );

    try {
      initializePluginRuntimeResources({
        ...deps,
        paths: createConfigPaths({
          rootDir: fileURLToPath(
            new URL('./resource/application', import.meta.url),
          ),
        }),
      });
      await expect(waitForPluginReady()).resolves.toBeUndefined();
      await expect(
        deps.ai.employeeManager.getEmployee('atlas'),
      ).resolves.toMatchObject({ username: 'atlas' });
      expect(createCollection).not.toHaveBeenCalled();
    } finally {
      await deps.database.disconnect();
    }
  });

  it('does not load LLM services from application or storage resource directories', async () => {
    const deps = createTestAppDeps();
    await deps.database.connect();
    const migrator = createMigrator({
      database: deps.database,
      packageName: '@nocobase/app-plugin-ai-employee',
      directory: fileURLToPath(
        new URL('../database/migrations', import.meta.url),
      ),
    });
    await migrator.latest();

    try {
      initializePluginRuntimeResources({
        ...deps,
        paths: createConfigPaths({
          rootDir: fileURLToPath(
            new URL('./resource/application', import.meta.url),
          ),
        }),
      });
      await expect(waitForPluginReady()).resolves.toBeUndefined();
      await expect(
        deps.ai.llmServiceManager.listLLMServices(),
      ).resolves.toEqual([]);
    } finally {
      await deps.database.disconnect();
    }
  });
});
