import { createCaching } from '@nocobase/caching';
import { ServiceProvider } from '@nocobase/service-provider';

import type { AppPluginApplication } from '../plugins/index.js';
import { cachingConfig } from './config.js';
import { cachingToken } from './token.js';

export class CachingProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server-kit/caching';

  public override register(): void {
    const config = this.app.config.get(cachingConfig);
    this.app.container.singleton(cachingToken, () => createCaching(config));
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(cachingToken)?.dispose();
  }
}
