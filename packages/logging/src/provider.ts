import {
  createServiceToken,
  ServiceProvider,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createLogging, type Logging } from './logging.js';
import type { LoggingConfig } from './types.js';

export const loggingToken: ServiceToken<Logging> =
  createServiceToken<Logging>('@nocobase/logging');

export interface LoggingProviderApplicationConfig {
  readonly logging?: LoggingConfig;
}

export interface LoggingProviderApplication<
  TConfig extends LoggingProviderApplicationConfig =
    LoggingProviderApplicationConfig,
> {
  readonly config: TConfig;
  readonly container: ServiceContainer;
}

export class LoggingProvider<
  TApplication extends LoggingProviderApplication = LoggingProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/logging';

  public override register(): void {
    this.app.container.singleton(loggingToken, () =>
      createLogging(this.app.config.logging),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.app.container.resolveIfCreated(loggingToken)?.flush();
  }
}
