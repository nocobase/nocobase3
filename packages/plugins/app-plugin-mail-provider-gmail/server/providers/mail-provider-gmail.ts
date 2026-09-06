import { mailProviderRegistryToken } from '@nocobase/app-plugin-mail/server/tokens';
import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { gmailMailProviderDefinition } from '../gmail.js';

export interface MailProviderGmailProviderApplication {
  readonly container: ServiceContainer;
}

export class MailProviderGmailProvider extends ServiceProvider<MailProviderGmailProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-mail-provider-gmail';

  public override boot(): Promise<void> {
    this.app.container
      .resolve(mailProviderRegistryToken)
      .register(gmailMailProviderDefinition);
    return Promise.resolve();
  }
}
