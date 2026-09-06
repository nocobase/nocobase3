import type {
  AIManager,
  FileStorageFactory,
  VectorDatabaseProvider,
  VectorDatabaseProviderFeature,
} from '@nocobase/ai-employee';
import { fileStorageFactoryToken } from '@nocobase/ai-employee';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/tokens';
import { loggingToken } from '@nocobase/app-server/logging';
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
  KnowledgeBaseManagerFactory,
  managerFactoryToken,
} from '../server/factories/manager-factory.js';
import {
  KnowledgeBaseRepositoryFactory,
  repositoryFactoryToken,
} from '../server/factories/repository-factory.js';
import {
  KnowledgeBaseServiceFactory,
  serviceFactoryToken,
} from '../server/factories/service-factory.js';
import {
  KnowledgeBaseDocumentRepository,
  KnowledgeBaseRepository,
  KnowledgeBaseSegmentRepository,
  KnowledgeBaseSegmentShardRepository,
  VectorDatabaseRepository,
  VectorStoreConfigRepository,
} from '../server/repository/index.js';
import { KnowledgeBaseProvider } from '../server/providers/knowledge-base.js';

const database = { query: {} } as unknown as DatabaseConnection;
const ai = {
  features: {
    vectorStoreProvider: { providerNames: [] },
  },
} as unknown as AIManager;
const fileStorageFactory = {} as FileStorageFactory;
const queue = {} as NocoBaseQueueManager;

const warningLogger = { warn: vi.fn() };
function createContainer(): ServiceContainer {
  const container = new ServiceContainer();
  container.instance(databaseManagerToken, {
    connection: vi.fn().mockReturnValue(database),
  } as unknown as DatabaseManager);
  container.instance(aiManagerToken, ai);
  container.instance(fileStorageFactoryToken, fileStorageFactory);
  container.instance(queueManagerToken, queue);
  container.instance(loggingToken, {
    getLogger: () => ({ child: () => warningLogger }),
  } as never);
  container.singleton(
    repositoryFactoryToken,
    () => new KnowledgeBaseRepositoryFactory(database),
  );
  return container;
}

describe('knowledge base factories', () => {
  it('caches repository, manager, and service instances as factory properties', () => {
    const repositories = createContainer().resolve(repositoryFactoryToken);
    expect(repositories.knowledgeBases).toBeInstanceOf(KnowledgeBaseRepository);
    expect(repositories.documents).toBeInstanceOf(
      KnowledgeBaseDocumentRepository,
    );
    expect(repositories.segments).toBeInstanceOf(
      KnowledgeBaseSegmentRepository,
    );
    expect(repositories.segmentShards).toBeInstanceOf(
      KnowledgeBaseSegmentShardRepository,
    );
    expect(repositories.vectorDatabases).toBeInstanceOf(
      VectorDatabaseRepository,
    );
    expect(repositories.vectorStoreConfigs).toBeInstanceOf(
      VectorStoreConfigRepository,
    );
    expect(
      new Set([
        repositories.knowledgeBases,
        repositories.documents,
        repositories.segments,
        repositories.segmentShards,
        repositories.vectorDatabases,
        repositories.vectorStoreConfigs,
      ]).size,
    ).toBe(6);
    expect(repositories.documents).toBe(repositories.documents);
    expect(repositories.documents).not.toBe(repositories.knowledgeBases);

    const managers = new KnowledgeBaseManagerFactory(
      ai,
      fileStorageFactory,
      queue,
      repositories,
      ['local'],
      warningLogger,
    );
    const services = new KnowledgeBaseServiceFactory(
      ai,
      managers,
      repositories,
      ['local'],
      warningLogger,
    );
    expect(managers.documents).toBe(managers.documents);
    expect(managers.segments).toBe(managers.segments);
    expect(services.documents).toBe(services.documents);
    expect(services.segments).toBe(services.segments);
    expect(services.knowledgeBases).toBe(services.knowledgeBases);
  });

  it('disposes cached factories idempotently', () => {
    const repositories = createContainer().resolve(repositoryFactoryToken);
    const managers = new KnowledgeBaseManagerFactory(
      ai,
      fileStorageFactory,
      queue,
      repositories,
      ['local'],
      warningLogger,
    );
    const services = new KnowledgeBaseServiceFactory(
      ai,
      managers,
      repositories,
      ['local'],
      warningLogger,
    );
    const documentRepository = repositories.documents;
    const documentManager = managers.documents;

    services.dispose();
    services.dispose();
    managers.dispose();
    managers.dispose();
    repositories.dispose();
    repositories.dispose();

    expect(() => services.documents).toThrow(
      'Knowledge base service factory has been disposed',
    );
    expect(() => managers.documents).toThrow(
      'Knowledge base manager factory has been disposed',
    );
    expect(() => repositories.documents).toThrow(
      'Knowledge base repository factory has been disposed',
    );
    expect(documentRepository).toBeDefined();
    expect(documentManager).toBeDefined();
  });

  it('registers repository, manager, and service factory bindings lazily', async () => {
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, {
      connection: vi.fn().mockReturnValue(database),
    } as unknown as DatabaseManager);
    container.instance(aiManagerToken, ai);
    container.instance(fileStorageFactoryToken, fileStorageFactory);
    container.instance(queueManagerToken, queue);
    container.instance(loggingToken, {
      getLogger: () => ({ child: () => warningLogger }),
    } as never);
    const provider = new KnowledgeBaseProvider({
      container,
      config: { get: vi.fn().mockReturnValue({ default: 'local' }) },
    } as never);

    provider.register();

    expect(container.has(repositoryFactoryToken)).toBe(true);
    expect(container.has(managerFactoryToken)).toBe(true);
    expect(container.has(serviceFactoryToken)).toBe(true);
    expect(container.resolveIfCreated(repositoryFactoryToken)).toBeUndefined();
    expect(container.resolveIfCreated(managerFactoryToken)).toBeUndefined();
    expect(container.resolveIfCreated(serviceFactoryToken)).toBeUndefined();

    const repositoryFactory = container.resolve(repositoryFactoryToken);
    const disposeRepositories = vi.spyOn(repositoryFactory, 'dispose');
    const managerFactory = container.resolve(managerFactoryToken);
    const disposeManagers = vi.spyOn(managerFactory, 'dispose');
    await provider.shutdown();
    expect(container.resolveIfCreated(serviceFactoryToken)).toBeUndefined();
    expect(disposeManagers).toHaveBeenCalledOnce();
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
    container.instance(loggingToken, {
      getLogger: () => ({ child: () => warningLogger }),
    } as never);
    const provider = new KnowledgeBaseProvider({
      container,
      config: { get: vi.fn().mockReturnValue({ default: 'local' }) },
    } as never);
    provider.register();
    await provider.boot();
    const customDispose = vi.fn().mockResolvedValue(undefined);
    const customProvider: VectorDatabaseProvider<unknown, unknown> = {
      validateConnectParams: vi.fn(),
      testConnection: vi.fn().mockResolvedValue({ success: true }),
      beforeCreate: vi.fn().mockResolvedValue({ status: 0 }),
      createVectorStore: vi.fn().mockResolvedValue({}),
      dispose: customDispose,
    };
    (features.vectorDatabaseProvider as VectorDatabaseProviderFeature).register(
      {
        name: 'custom',
        spec: 'Custom',
        provider: customProvider,
      },
    );
    const vectorDatabaseProviders = (
      features.vectorDatabaseProvider as {
        listProviders(): Array<{
          name: string;
          provider: { dispose(): Promise<void> };
        }>;
      }
    ).listProviders();
    const disposeProviders = vectorDatabaseProviders.map(({ provider }) =>
      vi.spyOn(provider, 'dispose'),
    );
    try {
      expect(features.enableFeatures).toHaveBeenCalledOnce();
      expect(
        (
          features.vectorDatabaseProvider as {
            listProviders(): Array<{ name: string }>;
          }
        ).listProviders(),
      ).toMatchObject([
        { name: 'NocobaseDefaultPGVectorProvider' },
        { name: 'custom' },
      ]);
      expect(
        (features.vectorStoreProvider as { providerNames: string[] })
          .providerNames,
      ).toEqual(['NocobaseLocalVectorStore', 'NocobaseReadOnlyVectorStore']);
    } finally {
      await provider.shutdown();
    }
    for (const disposeProvider of disposeProviders) {
      expect(disposeProvider).toHaveBeenCalledOnce();
    }
    expect(customDispose).toHaveBeenCalledOnce();
  });
});
