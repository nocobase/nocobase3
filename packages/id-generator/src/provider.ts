import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  type IdGeneratorService,
  SnowflakeIdGenerator,
  type SnowflakeIdGeneratorConfig,
} from './snowflake.js';

export const idGeneratorToken: ServiceToken<IdGeneratorService> =
  createServiceToken<IdGeneratorService>('@nocobase/id-generator');

export interface IdGeneratorProviderRuntimeConfig {
  readonly snowflake: SnowflakeIdGeneratorConfig;
}

export interface IdGeneratorProviderRuntime<
  TConfig extends IdGeneratorProviderRuntimeConfig =
    IdGeneratorProviderRuntimeConfig,
> {
  readonly config: TConfig;
}

export class IdGeneratorProvider<
  TRuntime extends IdGeneratorProviderRuntime = IdGeneratorProviderRuntime,
> extends ServiceProvider<TRuntime> {
  public readonly name: string = '@nocobase/id-generator';

  public override register(): void {
    const config = this.context.runtime.config.snowflake;
    this.context.serviceContainer.singleton(
      idGeneratorToken,
      () => new SnowflakeIdGenerator(config),
    );
  }
}
