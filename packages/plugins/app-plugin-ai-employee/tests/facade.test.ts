import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfigPaths } from '@nocobase/app-server-kit/config';
import { createMigrator } from '@nocobase/app-database';
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
import { CollectionRepositoryFactory } from '../server/repository/database/factory.js';
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

  it('loads storage/ai/models.json after the application manifest', async () => {
    const deps = createTestAppDeps();
    const storageDir = await mkdtemp(
      path.join(tmpdir(), 'ai-runtime-storage-'),
    );
    const storageAIDir = path.join(storageDir, 'ai');
    await mkdir(storageAIDir, { recursive: true });
    await writeFile(
      path.join(storageAIDir, 'models.json'),
      JSON.stringify([
        {
          name: 'deepseek',
          title: 'Runtime DeepSeek',
          provider: 'deepseek',
          options: { apiKey: 'runtime-key' },
          enabledModels: ['runtime-model'],
          enabled: false,
        },
      ]),
    );
    await deps.database.connect();
    const migrator = createMigrator({
      database: deps.database,
      packageName: '@nocobase/app-plugin-ai-employee',
      directory: fileURLToPath(
        new URL('../database/migrations', import.meta.url),
      ),
    });
    await migrator.latest();
    const repositories = new CollectionRepositoryFactory(
      deps.database.connection(),
    );
    await repositories.llmServices.create({
      values: {
        name: 'deepseek',
        title: 'Database DeepSeek',
        provider: 'deepseek',
        options: { apiKey: 'database-key' },
        enabledModels: {
          mode: 'custom',
          models: [{ label: 'Kept model', value: 'kept-model' }],
        },
        modelOptions: {},
        enabled: true,
        sort: 0,
      },
    });
    await repositories.llmServices.create({
      values: {
        name: 'obsolete',
        title: 'Obsolete',
        provider: 'openai',
        options: {},
        enabledModels: [],
        modelOptions: {},
        enabled: true,
        sort: 1,
      },
    });

    try {
      initializePluginRuntimeResources({
        ...deps,
        paths: createConfigPaths({
          rootDir: fileURLToPath(
            new URL('../../app-template-default', import.meta.url),
          ),
          storageDir,
        }),
      });
      await expect(waitForPluginReady()).resolves.toBeUndefined();
      await expect(
        deps.ai.llmServiceManager.getLLMService('deepseek'),
      ).resolves.toMatchObject({
        title: 'Runtime DeepSeek',
        options: { apiKey: 'runtime-key' },
        enabled: 1,
        enabledModels: {
          mode: 'custom',
          models: [{ label: 'Kept model', value: 'kept-model' }],
        },
      });
      await expect(
        deps.ai.llmServiceManager.getLLMService('obsolete'),
      ).resolves.toBeUndefined();
    } finally {
      await deps.database.disconnect();
      await rm(storageDir, { recursive: true, force: true });
    }
  });
});
