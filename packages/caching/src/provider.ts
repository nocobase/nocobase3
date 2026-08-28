import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createCaching, type Caching } from './caching.js';
import type { CachingConfig } from './types.js';

export const cachingToken: ServiceToken<Caching> =
  createServiceToken<Caching>('@nocobase/caching');

export interface CachingProviderRuntimeConfig {
  readonly caching: CachingConfig;
}

export interface CachingProviderRuntime<
  TConfig extends CachingProviderRuntimeConfig = CachingProviderRuntimeConfig,
> {
  readonly config: TConfig;
}

export class CachingProvider<
  TRuntime extends CachingProviderRuntime = CachingProviderRuntime,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = '@nocobase/caching';

  public override register(): void {
    const config = this.context.runtime.config.caching;
    this.context.serviceContainer.singleton(cachingToken, () =>
      createCaching(config),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.context.serviceContainer
      .resolveIfCreated(cachingToken)
      ?.dispose();
  }
}
