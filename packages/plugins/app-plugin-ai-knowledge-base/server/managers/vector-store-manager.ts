import type { VectorStore } from '@langchain/core/vectorstores';
import type { AIManager } from '@nocobase/ai-employee';

import type {
  KnowledgeBaseRepository,
  VectorDatabaseRepository,
} from '../repository/index.js';

export class VectorStoreManager {
  public constructor(
    private readonly ai: AIManager,
    private readonly knowledgeBases: KnowledgeBaseRepository,
    private readonly vectorDatabases: VectorDatabaseRepository,
  ) {}

  private readonly stores = new Map<string, Promise<VectorStore>>();

  public async get(knowledgeBaseKey: string): Promise<VectorStore> {
    const knowledgeBase = await this.knowledgeBases.findOne({
      key: knowledgeBaseKey,
    });
    if (!knowledgeBase) {
      throw new Error(`Knowledge base ${knowledgeBaseKey} not found`);
    }
    const {
      vectorDatabaseKey,
      llmService,
      embeddingModel,
      vectorStoreConfigHash,
    } = knowledgeBase;
    if (
      !vectorDatabaseKey ||
      !llmService ||
      !embeddingModel ||
      !vectorStoreConfigHash
    ) {
      throw new Error(
        `Vector store config for knowledge base ${knowledgeBaseKey} is missing`,
      );
    }

    let store = this.stores.get(vectorStoreConfigHash);
    if (!store) {
      store = this.create({
        vectorDatabaseKey,
        llmService,
        embeddingModel,
      });
      this.stores.set(vectorStoreConfigHash, store);
      store.catch(() => {
        if (this.stores.get(vectorStoreConfigHash) === store) {
          this.stores.delete(vectorStoreConfigHash);
        }
      });
    }
    return store;
  }

  public clear(): void {
    this.stores.clear();
  }

  private async create(config: {
    readonly vectorDatabaseKey: string;
    readonly llmService: string;
    readonly embeddingModel: string;
  }): Promise<VectorStore> {
    const vectorDatabase = await this.vectorDatabases.findOne({
      key: config.vectorDatabaseKey,
    });
    if (!vectorDatabase) {
      throw new Error(`Vector database ${config.vectorDatabaseKey} not found`);
    }
    const embedding = await this.ai.llmProviderManager.createEmbedding({
      llmService: config.llmService,
      model: config.embeddingModel,
    });
    return this.ai.features.vectorDatabaseProvider.createVectorStore<
      typeof vectorDatabase.connectProps,
      VectorStore
    >(vectorDatabase.provider, embedding, vectorDatabase.connectProps);
  }
}
