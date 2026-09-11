import {
  ServiceProvider,
  type ServiceContainer,
} from '@nocobase/service-provider';

import { mailProviderRegistryToken } from '@nocobase/app-plugin-mail/server/tokens';
import { imapSmtpMailProviderDefinition } from '../imap-smtp.js';

export interface MailProviderImapSmtpProviderApplication {
  readonly container: ServiceContainer;
}

export class MailProviderImapSmtpProvider extends ServiceProvider<MailProviderImapSmtpProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-mail-provider-imap-smtp';

  public override boot(): Promise<void> {
    this.app.container
      .resolve(mailProviderRegistryToken)
      .register(imapSmtpMailProviderDefinition);
    return Promise.resolve();
  }
}
