import { mailProviderRegistryToken } from '@nocobase/app-plugin-mail/server/tokens';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { microsoftMailProviderDefinition } from '../microsoft.js';

export interface MailProviderMicrosoftProviderApplication {
  readonly container: ServiceContainer;
}

export class MailProviderMicrosoftProvider extends ServiceProvider<MailProviderMicrosoftProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-mail-provider-microsoft';

  public override boot(): Promise<void> {
    this.app.container
      .resolve(mailProviderRegistryToken)
      .register(microsoftMailProviderDefinition);
    return Promise.resolve();
  }
}
