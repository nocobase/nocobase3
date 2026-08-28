import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { createLogging, type Logging } from './logging.js';
import type { LoggingConfig } from './types.js';

export const loggingToken: ServiceToken<Logging> =
  createServiceToken<Logging>('@nocobase/logging');

export interface LoggingProviderRuntimeConfig {
  readonly logging?: LoggingConfig;
}

export interface LoggingProviderRuntime<
  TConfig extends LoggingProviderRuntimeConfig = LoggingProviderRuntimeConfig,
> {
  readonly config: TConfig;
}

export class LoggingProvider<
  TRuntime extends LoggingProviderRuntime = LoggingProviderRuntime,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = '@nocobase/logging';

  public override register(): void {
    this.context.serviceContainer.singleton(loggingToken, () =>
      createLogging(this.context.runtime.config.logging),
    );
  }

  public override async shutdown(): Promise<void> {
    await this.context.serviceContainer.resolveIfCreated(loggingToken)?.flush();
  }
}
