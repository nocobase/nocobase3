import { loggingToken } from '@nocobase/app-server/logging';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import type { AppConfigAccessor } from '@nocobase/app-server/config';
import { AppHostSupervisor } from '@nocobase/app-host/supervisor';

import { type HubPluginConfig } from '../config.js';
import { DefaultHubService } from '../services/hub.js';
import { authenticationToken } from '@nocobase/app-plugin-authentication';
import { ApiKeyService } from '@nocobase/app-plugin-api-keys/server';
import { HUB_API_KEY_CONFIG_ID } from '../api-key-auth.js';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  HubApiKeyService,
  hubApiKeyServiceToken,
} from '../services/api-keys.js';
import { hubServiceToken } from '../tokens.js';

export interface HubProviderApplication {
  readonly container: ServiceContainer;
  readonly config: AppConfigAccessor;
}

export class HubProvider extends ServiceProvider<HubProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-hub';
  private hostController?: AppHostSupervisor;

  public override register(): void {
    this.app.container.singleton(
      hubApiKeyServiceToken,
      (resolver) =>
        new HubApiKeyService(
          resolver.resolve(databaseManagerToken),
          resolver.resolve(authorizationToken),
          new ApiKeyService(
            resolver.resolve(authenticationToken),
            HUB_API_KEY_CONFIG_ID,
          ),
          this.app.config.get<{ secret?: string }>('auth')?.secret,
        ),
    );
    this.app.container.singleton(hubServiceToken, (resolver) => {
      const config = this.app.config.get<HubPluginConfig>('hub')!;
      this.hostController = AppHostSupervisor.initialize({
        ...config.host,
        logger: resolver.has(loggingToken)
          ? resolver.resolve(loggingToken).getLogger('host-supervisor')
          : undefined,
        mode: 'managed',
      });
      return new DefaultHubService({
        apiKeys: resolver.resolve(hubApiKeyServiceToken),

        logger: resolver.has(loggingToken)
          ? resolver.resolve(loggingToken).getLogger('hub')
          : undefined,
        database: resolver.resolve(databaseManagerToken),
        config,
        hostController: this.hostController,
        publicBasePath: this.app.config.get<string>('app.publicBasePath'),
      });
    });
  }

  public override async start(): Promise<void> {
    if (!this.app.config.get<HubPluginConfig>('hub')!.host.enabled) return;
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
