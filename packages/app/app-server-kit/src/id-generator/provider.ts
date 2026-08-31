import { SnowflakeIdGenerator } from '@nocobase/id-generator';
import { ServiceProvider } from '@nocobase/service-provider';

import type { AppPluginApplication } from '../plugins/index.js';
import { snowflakeConfig } from './config.js';
import { idGeneratorToken } from './token.js';

export class IdGeneratorProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-server-kit/id-generator';

  public override register(): void {
    const config = this.app.config.get(snowflakeConfig);
    this.app.container.singleton(
      idGeneratorToken,
      () => new SnowflakeIdGenerator(config),
    );
  }
}
