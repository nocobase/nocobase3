import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import {
  Registry,
  type VectorDatabaseProvider,
  type VectorDatabaseProviderFeature,
  type VectorDatabaseProviderInfo,
} from '@nocobase/ai-employee';

export class VectorDatabaseProviderFeatureImpl implements VectorDatabaseProviderFeature {
  public constructor(
    private readonly renderConnectParams: <T>(value: T) => T = (value) => value,
  ) {}

  private readonly providers = new Registry<
    VectorDatabaseProviderInfo<unknown, unknown>
  >();

  public register<T, R>(providerInfo: VectorDatabaseProviderInfo<T, R>): void {
    this.providers.register(providerInfo.name, providerInfo);
  }

  public validateConnectParams<T>(
    providerName: string,
    connectParams: T,
  ): void {
    this.getProvider<T, unknown>(providerName).validateConnectParams(
      this.renderConnectParams(connectParams),
    );
  }

  public testConnection<T>(
    providerName: string,
    connectParams: T,
  ): Promise<{ success: boolean; error?: string }> {
    return this.getProvider<T, unknown>(providerName).testConnection(
      this.renderConnectParams(connectParams),
    );
  }

  public beforeCreate<T>(
    providerName: string,
    connectParams: T,
    options?: unknown,
  ): Promise<{ status: number; message?: string }> {
    return this.getProvider<T, unknown>(providerName).beforeCreate(
      this.renderConnectParams(connectParams),
      options,
    );
  }

  public createVectorStore<T, R>(
    providerName: string,
    embeddings: EmbeddingsInterface,
    connectParams: T,
  ): Promise<R> {
    return this.getProvider<T, R>(providerName).createVectorStore(
      embeddings,
      this.renderConnectParams(connectParams),
    );
  }

  public listProviders(): VectorDatabaseProviderInfo<unknown, unknown>[] {
    return [...this.providers.getValues()];
  }

  private getProvider<T, R>(
    providerName: string,
  ): VectorDatabaseProvider<T, R> {
    const providerInfo = this.providers.get(providerName);
    if (!providerInfo) {
      throw new Error(
        `Vector database provider "${providerName}" is not registered`,
      );
    }
    return providerInfo.provider as VectorDatabaseProvider<T, R>;
  }
}
