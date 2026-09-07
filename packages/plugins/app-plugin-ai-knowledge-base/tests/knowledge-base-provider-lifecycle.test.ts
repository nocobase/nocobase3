import type { AIManager } from '@nocobase/ai-employee';
import { fileStorageFactoryToken } from '@nocobase/ai-employee';
import type { AIApplicationConfig } from '@nocobase/app-plugin-ai-employee/server/config';
import { aiManagerToken } from '@nocobase/app-plugin-ai-employee/server/plugin';
import { driveConfig, driveManagerToken } from '@nocobase/app-server/drive';
import { loggingToken } from '@nocobase/app-server/logging';
import { queueManagerToken } from '@nocobase/app-server/queue';
import { databaseManagerToken } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';

import { repositoryFactoryToken } from '../server/factories/repository-factory.js';
import { KnowledgeBaseProvider } from '../server/providers/knowledge-base.js';
import type { VectorDatabaseEntity } from '../server/repository/index.js';

type ConfigChangeListener = (change: {
  readonly previous: AIApplicationConfig;
  readonly current: AIApplicationConfig;
}) => void | Promise<void>;

const connection = {
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'secret',
  database: 'nocobase',
  tableName: 'documents',
};

function applicationConfig(
  options: {
    readonly vectorDatabases?: AIApplicationConfig['aiKnowledgeBase'] extends infer T
      ? T extends { vectorDatabases?: infer V }
        ? V
        : never
      : never;
    readonly manifests?: AIApplicationConfig['aiKnowledgeBase'] extends infer T
      ? T extends { manifests?: infer V }
        ? V
        : never
      : never;
  } = {},
): AIApplicationConfig {
  return {
    storage: {},
    aiEmployee: { storage: {} },
    aiKnowledgeBase: {
      storage: {},
      vectorDatabases: options.vectorDatabases ?? [],
      manifests: options.manifests ?? [],
    },
    llmServices: [],
  };
}

function vectorConfig(host = connection.host) {
  return {
    name: 'primary',
    connection: { ...connection, host },
  };
}

function vectorEntity(host = connection.host): VectorDatabaseEntity {
  return {
    id: 1,
    key: 'primary',
    name: 'primary',
    databaseSpec: 'PGVector',
    provider: 'NocobaseDefaultPGVectorProvider',
    connectProps: { ...connection, host },
    enabled: true,
    managedBy: 'config',
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createHarness(initialConfig: AIApplicationConfig) {
  const container = new ServiceContainer();
  const features = {
    enableFeatures: vi.fn((value: Record<string, unknown>) => {
      Object.assign(features, value);
    }),
    disableFeatures: vi.fn((keys: readonly string[]) => {
      for (const key of keys) {
        delete (features as Record<string, unknown>)[key];
      }
    }),
  } as Record<string, unknown> & {
    enableFeatures: ReturnType<typeof vi.fn>;
    disableFeatures: ReturnType<typeof vi.fn>;
  };
  const ai = { features } as unknown as AIManager;
  const getStream = vi.fn().mockRejectedValue(new Error('stop after read'));
  const drive = {
    use: vi.fn(() => ({ getStream })),
  };
  const warn = vi.fn();
  let currentConfig = initialConfig;
  let listener: ConfigChangeListener | undefined;
  const unsubscribe = vi.fn();
  const config = {
    get: vi.fn((definition: unknown) =>
      definition === driveConfig ? { default: 'local' } : currentConfig,
    ),
    subscribe: vi.fn((_definition: unknown, next: ConfigChangeListener) => {
      listener = next;
      return unsubscribe;
    }),
  };

  container.instance(databaseManagerToken, {
    connection: vi.fn().mockReturnValue({ query: {} }),
  } as never);
  container.instance(aiManagerToken, ai);
  container.instance(fileStorageFactoryToken, {} as never);
  container.instance(queueManagerToken, {} as never);
  container.instance(driveManagerToken, drive as never);
  container.instance(loggingToken, {
    getLogger: () => ({ child: () => ({ warn }) }),
  } as never);

  const provider = new KnowledgeBaseProvider({ container, config } as never);
  provider.register();

  const repositories = container.resolve(repositoryFactoryToken);
  const vectors = repositories.vectorDatabases;
  const vectorFind = vi.spyOn(vectors, 'find').mockResolvedValue([]);
  const vectorCreate = vi
    .spyOn(vectors, 'create')
    .mockResolvedValue(vectorEntity());
  const vectorUpdate = vi.spyOn(vectors, 'update').mockResolvedValue(1);
  const vectorDestroy = vi.spyOn(vectors, 'destroy').mockResolvedValue(1);
  const baseFind = vi
    .spyOn(repositories.knowledgeBases, 'find')
    .mockResolvedValue([]);
  const manifestFindOne = vi
    .spyOn(repositories.manifests, 'findOne')
    .mockResolvedValue(null);

  return {
    baseFind,
    config,
    drive,
    emitConfig: async (next: AIApplicationConfig): Promise<void> => {
      const previous = currentConfig;
      currentConfig = next;
      if (!listener) throw new Error('Config listener is not registered');
      await listener({ previous, current: next });
    },
    emitConfigWithoutWaiting: (next: AIApplicationConfig): Promise<void> => {
      const previous = currentConfig;
      currentConfig = next;
      if (!listener) {
        return Promise.reject(new Error('Config listener is not registered'));
      }
      return Promise.resolve(listener({ previous, current: next }));
    },
    features,
    getStream,
    manifestFindOne,
    provider,
    unsubscribe,
    vectorCreate,
    vectorDestroy,
    vectorFind,
    vectorUpdate,
    warn,
  };
}

describe('KnowledgeBaseProvider vector config lifecycle', () => {
  it('does not read a Manifest when initial vector config validation fails', async () => {
    const harness = createHarness(
      applicationConfig({
        vectorDatabases: [
          {
            ...vectorConfig(),
            connection: { ...connection, tableName: 'invalid table name' },
          },
        ],
        manifests: [{ disk: 'local', locations: ['manifest.yml'] }],
      }),
    );

    await expect(harness.provider.boot()).rejects.toBeDefined();
    expect(harness.vectorFind).not.toHaveBeenCalled();
    expect(harness.manifestFindOne).not.toHaveBeenCalled();
    expect(harness.drive.use).not.toHaveBeenCalled();
    expect(harness.config.subscribe).not.toHaveBeenCalled();
    expect(harness.unsubscribe).not.toHaveBeenCalled();

    await harness.provider.shutdown();
  });

  it('finishes initial vector synchronization before reading Manifest sources', async () => {
    const harness = createHarness(
      applicationConfig({
        vectorDatabases: [vectorConfig()],
        manifests: [{ disk: 'local', locations: ['manifest.yml'] }],
      }),
    );
    const createGate = deferred<VectorDatabaseEntity>();
    harness.vectorCreate.mockReturnValueOnce(createGate.promise);

    const boot = harness.provider.boot();
    await vi.waitFor(() => expect(harness.vectorCreate).toHaveBeenCalledOnce());
    expect(harness.manifestFindOne).not.toHaveBeenCalled();
    expect(harness.drive.use).not.toHaveBeenCalled();

    createGate.resolve(vectorEntity());
    await boot;

    expect(harness.manifestFindOne).toHaveBeenCalledOnce();
    expect(harness.drive.use).toHaveBeenCalledWith('local');
    expect(harness.vectorCreate.mock.invocationCallOrder[0]).toBeLessThan(
      harness.drive.use.mock.invocationCallOrder[0],
    );

    await harness.provider.shutdown();
  });

  it('updates vector config on reload without replaying Manifests', async () => {
    const initial = applicationConfig({
      vectorDatabases: [vectorConfig('initial-host')],
      manifests: [{ disk: 'local', locations: ['initial.yml'] }],
    });
    const harness = createHarness(initial);
    harness.vectorFind
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([vectorEntity('initial-host')]);

    await harness.provider.boot();
    expect(harness.drive.use).toHaveBeenCalledOnce();

    await harness.emitConfig(
      applicationConfig({
        vectorDatabases: [vectorConfig('reloaded-host')],
        manifests: [{ disk: 'local', locations: ['replacement.yml'] }],
      }),
    );

    expect(harness.vectorUpdate).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({
        connectProps: expect.objectContaining({ host: 'reloaded-host' }),
        managedBy: 'config',
      }),
    );
    expect(harness.drive.use).toHaveBeenCalledOnce();
    expect(harness.getStream).toHaveBeenCalledOnce();

    await harness.provider.shutdown();
  });

  it('serializes overlapping reload synchronizations', async () => {
    const harness = createHarness(
      applicationConfig({ vectorDatabases: [vectorConfig('initial-host')] }),
    );
    harness.vectorFind
      .mockResolvedValueOnce([])
      .mockResolvedValue([vectorEntity()]);
    await harness.provider.boot();

    const firstUpdate = deferred<number>();
    harness.vectorUpdate
      .mockReturnValueOnce(firstUpdate.promise)
      .mockResolvedValueOnce(1);

    const firstReload = harness.emitConfigWithoutWaiting(
      applicationConfig({ vectorDatabases: [vectorConfig('first-host')] }),
    );
    await vi.waitFor(() => expect(harness.vectorUpdate).toHaveBeenCalledOnce());

    const secondReload = harness.emitConfigWithoutWaiting(
      applicationConfig({ vectorDatabases: [vectorConfig('second-host')] }),
    );
    await Promise.resolve();
    expect(harness.vectorFind).toHaveBeenCalledTimes(2);
    expect(harness.vectorUpdate).toHaveBeenCalledTimes(1);

    firstUpdate.resolve(1);
    await firstReload;
    await secondReload;

    expect(harness.vectorFind).toHaveBeenCalledTimes(3);
    expect(harness.vectorUpdate).toHaveBeenCalledTimes(2);
    expect(harness.vectorUpdate).toHaveBeenNthCalledWith(
      2,
      { id: 1 },
      expect.objectContaining({
        connectProps: expect.objectContaining({ host: 'second-host' }),
      }),
    );

    await harness.provider.shutdown();
  });

  it('unsubscribes and drains an in-flight reload before shutdown', async () => {
    const harness = createHarness(applicationConfig());
    harness.vectorFind.mockResolvedValue([]);
    await harness.provider.boot();

    const createGate = deferred<VectorDatabaseEntity>();
    harness.vectorCreate.mockReturnValueOnce(createGate.promise);
    const reload = harness.emitConfigWithoutWaiting(
      applicationConfig({ vectorDatabases: [vectorConfig()] }),
    );
    await vi.waitFor(() => expect(harness.vectorCreate).toHaveBeenCalledOnce());

    let shutdownFinished = false;
    const shutdown = harness.provider.shutdown().then(() => {
      shutdownFinished = true;
    });
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(shutdownFinished).toBe(false);

    createGate.resolve(vectorEntity());
    await reload;
    await shutdown;
    expect(shutdownFinished).toBe(true);
  });
});
