import { appApiClientToken, ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { Mail } from 'lucide-react';
import { createElement } from 'react';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureMailClient } from './runtime.js';

const MAIL_NAMESPACE = '@nocobase/app-plugin-mail';

export class MailClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-mail/client';

  public override boot(): Promise<void> {
    configureMailClient(this.app.container.resolve(appApiClientToken));
    this.app.refine.addResources([
      {
        name: 'mail',
        list: '/mail',
        meta: {
          label: 'nav.workspace',
          i18nNs: MAIL_NAMESPACE,
          icon: createElement(Mail),
        },
      },
    ]);
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  MailClientServiceProvider,
];

export default serviceProviders;
