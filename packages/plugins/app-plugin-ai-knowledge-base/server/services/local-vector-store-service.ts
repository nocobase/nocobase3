import type { VectorStore } from '@langchain/core/vectorstores';
import type {
  DocumentSegmentedWithScore,
  VectorStoreProp,
  VectorStoreSearchOptions,
  VectorStoreService,
} from '@nocobase/ai-employee';

import type { VectorStoreManager } from '../managers/vector-store-manager.js';

export class LocalVectorStoreService implements VectorStoreService<VectorStore> {
  public constructor(
    private readonly vectorStores: VectorStoreManager,
    private readonly vectorStoreConfigKey: string,
    private readonly vectorStoreProps: readonly VectorStoreProp[],
  ) {}

  public getVectorStore(): Promise<VectorStore> {
    return this.vectorStores.get(this.vectorStoreConfigKey);
  }

  public async search(
    query: string,
    options: VectorStoreSearchOptions = {},
  ): Promise<DocumentSegmentedWithScore[]> {
    const vectorStore = await this.getVectorStore();
    const result = await vectorStore.similaritySearchWithScore(
      query,
      options.topK,
      {
        ...this.toFilter(this.vectorStoreProps),
        ...this.toFilterObject(options.filter),
      },
    );
    return result
      .filter(
        ([, score]) =>
          options.score === undefined || score >= Number(options.score),
      )
      .map(([document, score]) => ({
        content: document.pageContent,
        metadata: document.metadata,
        id: document.id,
        score,
      }));
  }

  private toFilter(props: readonly VectorStoreProp[]): Record<string, unknown> {
    return Object.fromEntries(props.map((item) => [item.key, item.value]));
  }

  private toFilterObject(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
