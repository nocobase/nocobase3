import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import type { AppConfigAccessor } from '@nocobase/app-server/config';

import { hubConfig } from '../config.js';
import { DefaultHubService } from '../services/hub.js';
import { hubServiceToken } from '../tokens.js';

export interface HubProviderApplication {
  readonly container: ServiceContainer;
  readonly config: AppConfigAccessor;
}

export class HubProvider extends ServiceProvider<HubProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-hub';

  public override register(): void {
    this.app.container.singleton(
      hubServiceToken,
      (resolver) =>
        new DefaultHubService({
          database: resolver.resolve(databaseManagerToken),
          config: this.app.config.get(hubConfig),
        }),
    );
  }

  public override async start(): Promise<void> {
    if (!this.app.config.get(hubConfig).host.enabled) return;
    await this.app.container.resolve(hubServiceToken).restoreDesiredState();
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(hubServiceToken)?.shutdown();
  }
}
