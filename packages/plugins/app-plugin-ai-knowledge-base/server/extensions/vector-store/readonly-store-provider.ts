import type {
  VectorStoreProp,
  VectorStoreProvider,
  VectorStoreService,
} from '@nocobase/ai-employee';

import type { VectorStoreManager } from '../../managers/vector-store-manager.js';
import { LocalVectorStoreService } from '../../services/vector-store-service.js';

export const READONLY_VECTOR_STORE_PROVIDER_NAME =
  'NocobaseReadOnlyVectorStore';

export class ReadonlyVectorStoreProvider implements VectorStoreProvider {
  public readonly providerName: string = READONLY_VECTOR_STORE_PROVIDER_NAME;

  public constructor(private readonly vectorStores: VectorStoreManager) {}

  public createVectorStoreService(
    vectorStoreProps: VectorStoreProp[] = [],
  ): Promise<VectorStoreService> {
    const knowledgeBaseKey = vectorStoreProps.find(
      (item) => item.key === 'knowledgeBaseKey',
    )?.value;
    if (!knowledgeBaseKey) {
      return Promise.reject(new Error('Knowledge base key is required'));
    }
    return Promise.resolve(
      new LocalVectorStoreService(
        this.vectorStores,
        String(knowledgeBaseKey),
        vectorStoreProps.filter((item) => item.key !== 'knowledgeBaseKey'),
      ),
    );
  }
}
