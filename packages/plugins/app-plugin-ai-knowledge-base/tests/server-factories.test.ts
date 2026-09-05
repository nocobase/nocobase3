import type { AIManager, FileStorageFactory } from '@nocobase/ai-employee';
import { fileStorageFactoryToken } from '@nocobase/ai-employee';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/tokens';
import { queueManagerToken } from '@nocobase/app-server/queue';
import {
  databaseManagerToken,
  type DatabaseConnection,
  type DatabaseManager,
} from '@nocobase/db';
import type { NocoBaseQueueManager } from '@nocobase/queue';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import {
  KnowledgeBaseRepositoryFactory,
  repositoryFactoryToken,
} from '../server/factories/repository-factory.js';
import {
  KnowledgeBaseServiceFactory,
  serviceFactoryToken,
} from '../server/factories/service-factory.js';
import { KnowledgeBaseProvider } from '../server/providers/knowledge-base.js';

const database = { query: {} } as unknown as DatabaseConnection;
const ai = {
  features: {
    vectorStoreProvider: { providerNames: [] },
  },
} as unknown as AIManager;
const fileStorageFactory = {} as FileStorageFactory;
const queue = {} as NocoBaseQueueManager;

function createContainer(): ServiceContainer {
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, {
    connection: vi.fn().mockReturnValue(database),
  } as unknown as DatabaseManager);
  container.instance(aiManagerToken, ai);
  container.instance(fileStorageFactoryToken, fileStorageFactory);
  container.instance(queueManagerToken, queue);
  container.singleton(
    repositoryFactoryToken,
    () => new KnowledgeBaseRepositoryFactory(database),
  );
  return container;
}

describe('knowledge base factories', () => {
  it('caches repository, manager, and service instances as factory properties', () => {
    const repositories = createContainer().resolve(repositoryFactoryToken);
    expect(repositories.documents).toBe(repositories.documents);
    expect(repositories.documents).not.toBe(repositories.knowledgeBases);

    const services = new KnowledgeBaseServiceFactory(
      ai,
      fileStorageFactory,
      queue,
      repositories,
      ['local'],
    );
    expect(services.managers.documents).toBe(services.managers.documents);
    expect(services.managers.segments).toBe(services.managers.segments);
    expect(services.documents).toBe(services.documents);
    expect(services.segments).toBe(services.segments);
    expect(services.knowledgeBases).toBe(services.knowledgeBases);
  });

  it('disposes cached factories idempotently', () => {
    const repositories = createContainer().resolve(repositoryFactoryToken);
    const services = new KnowledgeBaseServiceFactory(
      ai,
      fileStorageFactory,
      queue,
      repositories,
      ['local'],
    );
    const documentRepository = repositories.documents;
    const documentManager = services.managers.documents;

    services.dispose();
    services.dispose();
    repositories.dispose();
    repositories.dispose();

    expect(() => services.documents).toThrow(
      'Knowledge base service factory has been disposed',
    );
    expect(() => services.managers.documents).toThrow(
      'Knowledge base manager factory has been disposed',
    );
    expect(() => repositories.documents).toThrow(
      'Knowledge base repository factory has been disposed',
    );
    expect(documentRepository).toBeDefined();
    expect(documentManager).toBeDefined();
  });

  it('registers only repository and service factory bindings lazily', async () => {
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {
      connection: vi.fn().mockReturnValue(database),
    } as unknown as DatabaseManager);
    container.instance(aiManagerToken, ai);
    container.instance(fileStorageFactoryToken, fileStorageFactory);
    container.instance(queueManagerToken, queue);
    const provider = new KnowledgeBaseProvider({
      container,
      config: { get: vi.fn().mockReturnValue({ default: 'local' }) },
    } as never);

    provider.register();

    expect(container.has(repositoryFactoryToken)).toBe(true);
    expect(container.has(serviceFactoryToken)).toBe(true);
    expect(container.resolveIfCreated(repositoryFactoryToken)).toBeUndefined();
    expect(container.resolveIfCreated(serviceFactoryToken)).toBeUndefined();

    const repositoryFactory = container.resolve(repositoryFactoryToken);
    const disposeRepositories = vi.spyOn(repositoryFactory, 'dispose');
    await provider.shutdown();
    expect(container.resolveIfCreated(serviceFactoryToken)).toBeUndefined();
    expect(disposeRepositories).toHaveBeenCalledOnce();
  });

  it('constructs features in boot and registers providers through AI Manager features', async () => {
    const enabled: Record<string, unknown> = {};
    const features = {
      enableFeatures: vi.fn((value: Record<string, unknown>) => {
        Object.assign(enabled, value);
        Object.assign(features, value);
      }),
      disableFeatures: vi.fn((keys: string[]) => {
        for (const key of keys) delete enabled[key];
      }),
    } as Record<string, unknown> & {
      enableFeatures: ReturnType<typeof vi.fn>;
      disableFeatures: ReturnType<typeof vi.fn>;
    };
    const bootAI = { features } as unknown as AIManager;
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {
      connection: vi.fn().mockReturnValue(database),
    } as unknown as DatabaseManager);
    container.instance(aiManagerToken, bootAI);
    container.instance(fileStorageFactoryToken, fileStorageFactory);
    container.instance(queueManagerToken, queue);
    const provider = new KnowledgeBaseProvider({
      container,
      config: { get: vi.fn().mockReturnValue({ default: 'local' }) },
    } as never);
    provider.register();
    await provider.boot();
    try {
      expect(features.enableFeatures).toHaveBeenCalledOnce();
      expect(
        (
          features.vectorDatabaseProvider as {
            listProviders(): Array<{ name: string }>;
          }
        ).listProviders(),
      ).toMatchObject([{ name: 'NocobaseDefaultPGVectorProvider' }]);
      expect(
        (features.vectorStoreProvider as { providerNames: string[] })
          .providerNames,
      ).toEqual([
        'NocobaseLocalVectorStoreProvider',
        'NocobaseReadonlyVectorStoreProvider',
        'NocobaseLocalVectorStore',
        'NocobaseReadOnlyVectorStore',
      ]);
    } finally {
      await provider.shutdown();
    }
  });
});
