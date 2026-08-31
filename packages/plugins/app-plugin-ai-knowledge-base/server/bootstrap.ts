import type { AppPluginServerContext } from '@nocobase/app-server-kit/plugins';
import type { AIManager, FileManager } from '@nocobase/ai-employee';
import { DriveFileManager, MemoryFileManager } from '@nocobase/ai-employee';
import { KnowledgeBaseService } from './service.js';
import {
  KnowledgeBaseFeatureService,
  PGVectorProvider,
  PG_VECTOR_PROVIDER_NAME,
} from './vector.js';
import type { KnowledgeBasePluginDeps } from './types.js';

type BootstrapContext = AppPluginServerContext<
  KnowledgeBasePluginDeps & {
    ai: AIManager;
    driveManager?: unknown;
  },
  unknown
>;

export default function bootstrap(context: BootstrapContext): void {
  const deps = context.deps as KnowledgeBasePluginDeps & {
    driveManager?: import('@nocobase/drive').NocoBaseDriveManager;
  };
  const fileManager: FileManager = deps.driveManager
    ? new DriveFileManager(deps.driveManager, undefined, 'ai-knowledge-base')
    : new MemoryFileManager();
  const vectorProvider = new PGVectorProvider();
  const service = new KnowledgeBaseService(
    deps.database.connection(),
    deps.ai,
    fileManager,
    deps.queueManager,
    vectorProvider,
  );
  const knowledgeBaseFeature = new KnowledgeBaseFeatureService(
    deps.database.connection(),
    deps.ai,
    vectorProvider,
  );

  deps.ai.features.enableFeatures({
    vectorDatabase: {
      async getVectorDatabaseInfo(id: string) {
        const record = await service.vectors.findById(id);
        if (!record) throw new Error(`Vector database "${id}" not found`);
        return {
          id: String(record.id),
          name: record.name,
          databaseSpec: record.databaseSpec,
          provider: record.provider,
          connectProps: record.connectProps,
          enabled: record.enabled,
        };
      },
      async listVectorDatabasesInfo() {
        const records = await service.vectors.find({
          filter: { enabled: true },
          sort: ['name'],
        });
        return records.map((record) => ({
          id: String(record.id),
          name: record.name,
          databaseSpec: record.databaseSpec,
          provider: record.provider,
          connectProps: record.connectProps,
          enabled: record.enabled,
        }));
      },
    },
    vectorDatabaseProvider: {
      register() {},
      validateConnectParams(providerName, params) {
        if (providerName === PG_VECTOR_PROVIDER_NAME)
          vectorProvider.validateConnectParams(params);
      },
      testConnection(providerName, params) {
        return providerName === PG_VECTOR_PROVIDER_NAME
          ? vectorProvider.testConnection(params)
          : Promise.resolve({
              success: false,
              error: `Vector database provider "${providerName}" is not registered`,
            });
      },
      beforeCreate(providerName, params, options) {
        return providerName === PG_VECTOR_PROVIDER_NAME
          ? vectorProvider.beforeCreate(params, options)
          : Promise.reject(
              new Error(
                `Vector database provider "${providerName}" is not registered`,
              ),
            );
      },
      async createVectorStore<T, R>(
        providerName: string,
        embeddings: import('@langchain/core/embeddings').EmbeddingsInterface,
        params: T,
      ): Promise<R> {
        if (providerName !== PG_VECTOR_PROVIDER_NAME)
          throw new Error(
            `Vector database provider "${providerName}" is not registered`,
          );
        return (await vectorProvider.createVectorStore(
          embeddings,
          params,
        )) as R;
      },
      listProviders() {
        return [
          {
            name: PG_VECTOR_PROVIDER_NAME,
            spec: 'PGVector',
            provider: vectorProvider,
          },
        ];
      },
    },
    vectorStoreProvider: {
      providerNames: [
        'NocobaseLocalVectorStoreProvider',
        'NocobaseReadonlyVectorStoreProvider',
      ],
      register() {},
      async createVectorStoreService(_providerName, props = []) {
        const key = props.find(
          (item) =>
            item.key === 'knowledgeBaseKey' ||
            item.key === 'vectorStoreConfigKey',
        )?.value;
        return {
          getVectorStore: async () => {
            const base = key
              ? await service.bases.findOne({ key: String(key) })
              : null;
            if (!base)
              throw new Error(
                'Knowledge base vector store configuration not found',
              );
            const config = await service.vectors.findOne({
              key: base.vectorStoreConfigKey,
            });
            if (!config)
              throw new Error('Vector database configuration not found');
            const embedding = await deps.ai.llmProviderManager.createEmbedding({
              llmService: String(
                (config as Record<string, unknown>).llmService ?? '',
              ),
              model: String(
                (config as Record<string, unknown>).embeddingModel ?? '',
              ),
            });
            return vectorProvider.createVectorStore(
              embedding,
              config.connectProps,
            );
          },
          search: async (query, options) =>
            service.hitTest(
              String(key),
              query,
              options?.topK,
              options?.score ? Number(options.score) : undefined,
            ) as never,
        };
      },
    },
    knowledgeBase: knowledgeBaseFeature,
  });
  Object.defineProperty(deps.ai, '__knowledgeBaseService', {
    value: service,
    enumerable: false,
  });
  context.lifecycle.registerDisposer('vector-pools', async () => undefined);
}
