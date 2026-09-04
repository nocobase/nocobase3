import type { VectorStore } from '@langchain/core/vectorstores';
import type { AIManager } from '@nocobase/ai-employee';

import type {
  VectorDatabaseRecord,
  VectorStoreConfigRecord,
} from '../internal-types.js';
import type { TableRepository } from '../repositories/table-repository.js';

export class VectorStoreManager {
  public constructor(
    private readonly ai: AIManager,
    private readonly vectorStoreConfigs: TableRepository<VectorStoreConfigRecord>,
    private readonly vectorDatabases: TableRepository<VectorDatabaseRecord>,
  ) {}

  private readonly stores = new Map<string, Promise<VectorStore>>();

  public get(vectorStoreConfigKey: string): Promise<VectorStore> {
    let store = this.stores.get(vectorStoreConfigKey);
    if (!store) {
      store = this.create(vectorStoreConfigKey);
      this.stores.set(vectorStoreConfigKey, store);
      store.catch(() => this.stores.delete(vectorStoreConfigKey));
    }
    return store;
  }

  public clear(): void {
    this.stores.clear();
  }

  private async create(vectorStoreConfigKey: string): Promise<VectorStore> {
    const config = await this.vectorStoreConfigs.findOne({
      key: vectorStoreConfigKey,
    });
    if (!config) {
      throw new Error(`Vector store config ${vectorStoreConfigKey} not found`);
    }
    if (!config.vectorDatabaseKey) {
      throw new Error(
        `Vector store config ${vectorStoreConfigKey} has no vector database`,
      );
    }
    const vectorDatabase = await this.vectorDatabases.findOne({
      key: config.vectorDatabaseKey,
    });
    if (!vectorDatabase) {
      throw new Error(`Vector database ${config.vectorDatabaseKey} not found`);
    }
    const embedding = await this.ai.llmProviderManager.createEmbedding({
      llmService: String(config.llmService ?? ''),
      model: String(config.embeddingModel ?? ''),
    });
    return this.ai.features.vectorDatabaseProvider.createVectorStore<
      typeof vectorDatabase.connectProps,
      VectorStore
    >(vectorDatabase.provider, embedding, vectorDatabase.connectProps);
  }
}
