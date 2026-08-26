import { fileURLToPath } from 'node:url';

import { createMigrator } from '@nocobase/app-database';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import {
  createAIEmployeeContextMiddleware,
  createAIEmployeeRuntime,
  initializeAIEmployee,
  type AIEmployeeEnv,
} from '../server/runtime.js';
import { createTestAppDeps } from './app/test-app-deps.js';
describe('AI employee facade', () => {
  it('attaches a fresh request Context over one shared runtime', async () => {
    const deps = createTestAppDeps();
    const runtime = createAIEmployeeRuntime({ apiBasePath: '/v2/api', deps });
    const app = new Hono<AIEmployeeEnv>();
    const requestContexts: unknown[] = [];
    app.use(
      '*',
      createAIEmployeeContextMiddleware(
        runtime,
        {
          resolve: () => ({ id: 'fixture-user', roles: ['member'] }),
        },
        deps.auth,
      ),
    );
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

  it('uses the authenticated database user id as the request actor id', async () => {
    const deps = createTestAppDeps();
    vi.spyOn(deps.auth, 'getSession').mockResolvedValue({
      session: {} as never,
      user: { id: 'database-user-id', username: 'nocobase' } as never,
    });
    const runtime = createAIEmployeeRuntime({ apiBasePath: '/v2/api', deps });
    const app = new Hono<AIEmployeeEnv>();
    app.use(
      '*',
      createAIEmployeeContextMiddleware(runtime, undefined, deps.auth),
    );
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
      database: { connection: () => deps.database },
      packageName: '@nocobase/app-plugin-ai-employee',
      directory: fileURLToPath(
        new URL('../database/migrations', import.meta.url),
      ),
    });
    await migrator.latest();
    const createCollection = vi.spyOn(
      deps.database.builder,
      'createCollection',
    );

    try {
      const runtime = initializeAIEmployee({
        apiBasePath: '/v2/api',
        deps,
      });

      await expect(runtime.ready).resolves.toBeUndefined();
      expect(createCollection).not.toHaveBeenCalled();
    } finally {
      await deps.database.disconnect();
    }
  });
});
