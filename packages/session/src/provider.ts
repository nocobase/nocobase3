import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createNullSessionConfig, createSessionManager } from './manager.js';
import type { AppSessionConfig, NocoBaseSessionManager } from './types.js';

export const sessionManagerToken: ServiceToken<NocoBaseSessionManager> =
  createServiceToken<NocoBaseSessionManager>('@nocobase/session/manager');

export interface SessionProviderRuntimeConfig {
  readonly session?: AppSessionConfig;
}

export interface SessionProviderRuntime<
  TConfig extends SessionProviderRuntimeConfig = SessionProviderRuntimeConfig,
> {
  readonly config: TConfig;
}

export class SessionProvider<
  TRuntime extends SessionProviderRuntime = SessionProviderRuntime,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = '@nocobase/session';

  public override register(): void {
    this.context.serviceContainer.singleton(sessionManagerToken, () =>
      createSessionManager(
        this.context.runtime.config.session ?? createNullSessionConfig(),
      ),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.context.serviceContainer
      .resolveIfCreated(sessionManagerToken)
      ?.dispose();
  }
}
