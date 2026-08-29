import {
  createServiceToken,
  ServiceProvider,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  type IdGeneratorService,
  SnowflakeIdGenerator,
  type SnowflakeIdGeneratorConfig,
} from './snowflake.js';

export const idGeneratorToken: ServiceToken<IdGeneratorService> =
  createServiceToken<IdGeneratorService>('@nocobase/id-generator');

export interface IdGeneratorProviderApplicationConfig {
  readonly snowflake: SnowflakeIdGeneratorConfig;
}

export interface IdGeneratorProviderApplication<
  TConfig extends IdGeneratorProviderApplicationConfig =
    IdGeneratorProviderApplicationConfig,
> {
  readonly config: TConfig;
  readonly container: ServiceContainer;
}

export class IdGeneratorProvider<
  TApplication extends IdGeneratorProviderApplication =
    IdGeneratorProviderApplication,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/id-generator';

  public override register(): void {
    const config = this.app.config.snowflake;
    this.app.container.singleton(
      idGeneratorToken,
      () => new SnowflakeIdGenerator(config),
    );
  }
}
