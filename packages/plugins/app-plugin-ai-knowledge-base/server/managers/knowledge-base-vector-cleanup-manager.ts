import type { KnowledgeBaseEntity } from '../repository/index.js';
import type { VectorStoreManager } from './vector-store-manager.js';

type DeletableVectorStore = {
  delete(options: { filter: Record<string, unknown> }): Promise<void>;
};

export class KnowledgeBaseVectorCleanupManager {
  public constructor(private readonly vectorStores: VectorStoreManager) {}

  public async deleteKnowledgeBaseVectors(
    base: KnowledgeBaseEntity,
  ): Promise<void> {
    const store = await this.getLocalStore(base);
    if (!store) return;
    await store.delete({
      filter: { knowledgeBaseOuterId: base.knowledgeBaseOuterId },
    });
  }

  public async deleteDocumentVectors(
    base: KnowledgeBaseEntity,
    documentIds: readonly (string | number)[],
  ): Promise<void> {
    const store = await this.getLocalStore(base);
    if (!store) return;
    for (const documentId of documentIds) {
      await store.delete({ filter: { knowledgeBaseDocsId: documentId } });
    }
  }

  private async getLocalStore(
    base: KnowledgeBaseEntity,
  ): Promise<DeletableVectorStore | null> {
    if (base.knowledgeBaseType !== 'LOCAL') return null;
    return this.vectorStores.get(base.key);
  }
}
