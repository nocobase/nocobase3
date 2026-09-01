import type { ClientApplication } from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';
import { Activity, Boxes, ScrollText, Users } from 'lucide-react';
import { createElement } from 'react';

export class HubServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-hub/client';

  public override boot(): Promise<void> {
    this.app.refine.addResources([
      {
        name: 'hub.applications',
        list: '/apps',
        meta: {
          label: 'navigation.applications',
          i18nNs: '@nocobase/app-plugin-hub',
          icon: createElement(Boxes),
          priority: 10,
        },
      },
      {
        name: 'hub.deployments',
        list: '/deployments',
        meta: {
          label: 'navigation.deployments',
          i18nNs: '@nocobase/app-plugin-hub',
          icon: createElement(Activity),
          priority: 20,
        },
      },
      {
        name: 'hub.audit',
        list: '/audit',
        meta: {
          label: 'navigation.audit',
          i18nNs: '@nocobase/app-plugin-hub',
          icon: createElement(ScrollText),
          priority: 30,
        },
      },
      {
        name: 'hub.members',
        list: '/members',
        meta: {
          label: 'navigation.members',
          i18nNs: '@nocobase/app-plugin-hub',
          icon: createElement(Users),
          priority: 40,
        },
      },
    ]);
    return Promise.resolve();
  }
}
