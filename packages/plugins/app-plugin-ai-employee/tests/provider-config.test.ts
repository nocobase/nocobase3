import { AppConfig, createConfigPaths } from '@nocobase/app-server/config';
import { cachingToken } from '@nocobase/app-server/caching';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { loggingToken } from '@nocobase/app-server/logging';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import { createMigrator, databaseManagerToken } from '@nocobase/db';
import { createDriveManager } from '@nocobase/drive';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import { aiEmployeeConfig, type AIEmployeeConfig } from '../server/config.js';
import { AIEmployeeProvider } from '../server/providers/ai-employee.js';
import { aiManagerToken } from '../server/tokens.js';
import { CollectionRepositoryFactory } from '../server/repository/database/factory.js';
import { createTestAppDeps } from './app/test-app-deps.js';

const providers: AIEmployeeProvider[] = [];
const databases: ReturnType<typeof createTestAppDeps>['database'][] = [];

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.shutdown()));
  await Promise.all(
    databases.splice(0).map((database) => database.disconnect()),
  );
});

describe('AIEmployeeProvider application config', () => {
  it('migrates initial config into the database while preserving matching user state', async () => {
    const deps = createTestAppDeps();
    databases.push(deps.database);
    await deps.database.connect();
    await createMigrator({
      database: deps.database,
      packageName: '@nocobase/app-plugin-ai-employee',
      directory: new URL('../database/migrations', import.meta.url).pathname,
    }).latest();
    const repositories = new CollectionRepositoryFactory(
      deps.database.connection(),
    );
    await repositories.llmServices.create({
      values: {
        name: 'openai',
        title: 'Database title',
        provider: 'old-provider',
        options: { apiKey: 'database' },
        enabledModels: {
          mode: 'custom',
          models: [{ label: 'User model', value: 'user-model' }],
        },
        modelOptions: {},
        enabled: true,
        sort: 99,
      },
    });
    await repositories.llmServices.create({
      values: {
        name: 'obsolete',
        title: 'Obsolete',
        provider: 'openai',
        options: {},
        enabledModels: { mode: 'recommended', models: [] },
        modelOptions: {},
        enabled: true,
        sort: 0,
      },
    });
    const { provider, container } = await createProvider(
      () => ({
        ai: {
          llmServices: [
            {
              name: 'openai',
              title: 'Configured title',
              provider: 'openai',
              options: { apiKey: 'configured' },
              enabledModels: ['configured-model'],
              enabled: false,
              sort: 10,
            },
          ],
        },
      }),
      deps,
    );

    provider.register();
    await provider.boot();
    const manager = container.resolve(aiManagerToken).llmServiceManager;

    await expect(manager.getLLMService('openai')).resolves.toMatchObject({
      title: 'Configured title',
      provider: 'openai',
      options: { apiKey: 'configured' },
      enabled: 1,
      enabledModels: {
        mode: 'custom',
        models: [{ label: 'User model', value: 'user-model' }],
      },
      sort: 10,
    });
    await expect(manager.getLLMService('obsolete')).resolves.toBeUndefined();
  });

  it('synchronizes initial and reloaded snapshots and unsubscribes on shutdown', async () => {
    let current: AIEmployeeConfig = {
      llmServices: [
        {
          name: 'openai',
          title: 'Initial OpenAI',
          provider: 'openai',
          options: { apiKey: 'initial' },
          enabledModels: ['initial-model'],
          enabled: false,
        },
      ],
    };
    const { provider, config, container } = await createProvider(() => ({
      ai: current,
    }));

    provider.register();
    await provider.boot();
    const manager = container.resolve(aiManagerToken).llmServiceManager;
    await expect(manager.getLLMService('openai')).resolves.toMatchObject({
      title: 'Initial OpenAI',
      enabled: 0,
    });

    await manager.registerLLMService(
      {
        name: 'openai',
        provider: 'openai',
        enabled: true,
        enabledModels: ['user-model'],
      },
      { preserveUserState: false },
    );
    current = {
      llmServices: [
        {
          name: 'openai',
          title: 'Reloaded OpenAI',
          provider: 'openai',
          options: { apiKey: 'reloaded' },
          enabled: false,
          enabledModels: ['configured-model'],
        },
        { name: 'deepseek', provider: 'deepseek' },
      ],
    };

    await expect(config.reload()).resolves.toEqual({
      changedNamespaces: ['ai'],
    });
    await expect(manager.getLLMService('openai')).resolves.toMatchObject({
      title: 'Reloaded OpenAI',
      options: { apiKey: 'reloaded' },
      enabled: 1,
      enabledModels: {
        mode: 'custom',
        models: [{ label: 'user-model', value: 'user-model' }],
      },
    });
    await expect(manager.getLLMService('deepseek')).resolves.toBeDefined();
    await expect(config.reload()).resolves.toEqual({ changedNamespaces: [] });

    await provider.shutdown();
    current = { llmServices: [] };
    await config.reload();
    await expect(manager.listLLMServices()).resolves.toHaveLength(2);
  });

  it('uses new config state after a removed service is added again', async () => {
    let current: AIEmployeeConfig = {
      llmServices: [
        {
          name: 'openai',
          provider: 'openai',
          enabled: false,
          enabledModels: ['first-model'],
        },
      ],
    };
    const { provider, config, container } = await createProvider(() => ({
      ai: current,
    }));
    provider.register();
    await provider.boot();
    const manager = container.resolve(aiManagerToken).llmServiceManager;

    current = { llmServices: [] };
    await config.reload();
    await expect(manager.getLLMService('openai')).resolves.toBeUndefined();

    current = {
      llmServices: [
        {
          name: 'openai',
          provider: 'openai',
          enabled: true,
          enabledModels: ['second-model'],
        },
      ],
    };
    await config.reload();

    await expect(manager.getLLMService('openai')).resolves.toMatchObject({
      enabled: 1,
      enabledModels: {
        mode: 'custom',
        models: [{ label: 'second-model', value: 'second-model' }],
      },
    });
  });
});

async function createProvider(
  readConfig: () => Record<string, unknown>,
  existingDeps?: ReturnType<typeof createTestAppDeps>,
): Promise<{
  provider: AIEmployeeProvider;
  config: AppConfig;
  container: ServiceContainer;
}> {
  const deps = existingDeps ?? createTestAppDeps();
  if (!existingDeps) {
    databases.push(deps.database);
    await deps.database.connect();
    await createMigrator({
      database: deps.database,
      packageName: '@nocobase/app-plugin-ai-employee',
      directory: new URL('../database/migrations', import.meta.url).pathname,
    }).latest();
  }

  const paths = createConfigPaths({ rootDir: process.cwd() });
  const config = new AppConfig([aiEmployeeConfig, driveConfig], {
    context: { paths } as never,
  });
  config.load({
    name: 'test-ai-config',
    read: async () => ({ kind: 'map', value: readConfig() }),
  });
  await config.loadAll();

  const container = new ServiceContainer();
  container.instance(databaseManagerToken, deps.database);
  container.instance(authenticationToken, deps.auth);
  container.instance(cachingToken, deps.caching);
  container.instance(idGeneratorToken, deps.idGenerator);
  container.instance(loggingToken, deps.logging);
  container.instance(
    driveManagerToken,
    createDriveManager(config.get(driveConfig)),
  );
  const app: AppPluginApplication = {
    appName: 'main',
    publicBasePath: '',
    config,
    paths,
    router: new Hono(),
    container,
  };
  const provider = new AIEmployeeProvider(app);
  providers.push(provider);
  return { provider, config, container };
}
