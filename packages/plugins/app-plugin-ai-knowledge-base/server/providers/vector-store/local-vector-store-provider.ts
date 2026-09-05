import type {
  VectorStoreProp,
  VectorStoreProvider,
  VectorStoreService,
} from '@nocobase/ai-employee';

import type { VectorStoreManager } from '../../managers/vector-store-manager.js';
import { LocalVectorStoreService } from '../../services/local-vector-store-service.js';

export const LOCAL_VECTOR_STORE_PROVIDER_NAME =
  'NocobaseLocalVectorStoreProvider';
export const LEGACY_LOCAL_VECTOR_STORE_PROVIDER_NAME =
  'NocobaseLocalVectorStore';

export class LocalVectorStoreProvider implements VectorStoreProvider {
  public readonly providerName: string = LOCAL_VECTOR_STORE_PROVIDER_NAME;

  public constructor(private readonly vectorStores: VectorStoreManager) {}

  public createVectorStoreService(
    vectorStoreProps: VectorStoreProp[] = [],
  ): Promise<VectorStoreService> {
    const vectorStoreConfigKey = vectorStoreProps.find(
      (item) => item.key === 'vectorStoreConfigKey',
    )?.value;
    if (!vectorStoreConfigKey) {
      return Promise.reject(new Error('Vector store config key is required'));
    }
    return Promise.resolve(
      new LocalVectorStoreService(
        this.vectorStores,
        String(vectorStoreConfigKey),
        vectorStoreProps.filter((item) => item.key !== 'vectorStoreConfigKey'),
      ),
    );
  }
}
