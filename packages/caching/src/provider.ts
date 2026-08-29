import {
  createServiceToken,
  ServiceProvider,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createCaching, type Caching } from './caching.js';
import type { CachingConfig } from './types.js';

export const cachingToken: ServiceToken<Caching> =
  createServiceToken<Caching>('@nocobase/caching');

export interface CachingProviderApplicationConfig {
  readonly caching: CachingConfig;
}

export interface CachingProviderApplication<
  TConfig extends CachingProviderApplicationConfig =
    CachingProviderApplicationConfig,
> {
  readonly config: TConfig;
  readonly container: ServiceContainer;
}

export class CachingProvider<
  TApplication extends CachingProviderApplication = CachingProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/caching';

  public override register(): void {
    const config = this.app.config.caching;
    this.app.container.singleton(cachingToken, () => createCaching(config));
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(cachingToken)?.dispose();
  }
}
