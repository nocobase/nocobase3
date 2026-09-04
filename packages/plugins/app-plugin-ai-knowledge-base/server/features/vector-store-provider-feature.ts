import {
  Registry,
  type VectorStoreProp,
  type VectorStoreProvider,
  type VectorStoreProviderFeature,
  type VectorStoreService,
} from '@nocobase/ai-employee';

export class VectorStoreProviderFeatureImpl implements VectorStoreProviderFeature {
  private readonly providers = new Registry<VectorStoreProvider>();

  public get providerNames(): string[] {
    return [...this.providers.getKeys()];
  }

  public register(provider: VectorStoreProvider): void {
    this.providers.register(provider.providerName, provider);
  }

  public createVectorStoreService(
    providerName: string,
    vectorStoreProps?: VectorStoreProp[],
  ): Promise<VectorStoreService> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(
        `Vector store provider "${providerName}" is not registered`,
      );
    }
    return provider.createVectorStoreService(vectorStoreProps);
  }
}
