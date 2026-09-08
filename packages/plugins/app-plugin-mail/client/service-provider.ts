import { apiClientToken, ClientApplication } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureMailClient } from './runtime.js';
import { MailNavigationIcon } from './components/mail-navigation-icon.js';
import { createElement } from 'react';

export class MailClientServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-mail/client';

  public override boot(): Promise<void> {
    configureMailClient(this.app.container.resolve(apiClientToken));
    this.app.refine.addResources([
      {
        name: 'mail',
        list: '/mail',
        meta: {
          label: 'nav.mail',
          i18nNs: '@nocobase/app-plugin-mail',
          icon: createElement(MailNavigationIcon),
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
