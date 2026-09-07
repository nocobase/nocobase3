import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import type { AppConfigAccessor } from '@nocobase/app-server/config';
import { AppHostSupervisor } from '@nocobase/app-host/supervisor';

import { hubConfig } from '../config.js';
import { DefaultHubService } from '../services/hub.js';
import { hubServiceToken } from '../tokens.js';

export interface HubProviderApplication {
  readonly container: ServiceContainer;
  readonly config: AppConfigAccessor;
}

export class HubProvider extends ServiceProvider<HubProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-hub';
  private hostController?: AppHostSupervisor;

  public override register(): void {
    this.app.container.singleton(hubServiceToken, (resolver) => {
      const config = this.app.config.get(hubConfig);
      this.hostController = AppHostSupervisor.initialize({
        ...config.host,
        mode: 'managed',
      });
      return new DefaultHubService({
        database: resolver.resolve(databaseManagerToken),
        config,
        hostController: this.hostController,
      });
    });
  }

  public override async start(): Promise<void> {
    if (!this.app.config.get(hubConfig).host.enabled) return;
    await this.app.container.resolve(hubServiceToken).restoreDesiredState();
  }

  public override async shutdown(): Promise<void> {
    try {
      await this.app.container.resolveIfCreated(hubServiceToken)?.shutdown();
    } finally {
      await this.hostController?.shutdown();
    }
  }
}
