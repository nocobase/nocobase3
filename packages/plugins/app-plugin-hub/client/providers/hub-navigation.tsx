import {
  ClientApplication,
  type AppClientRefineConfig,
  type ClientServiceProviderContext,
} from '@nocobase/app-client';
import { ServiceProvider } from '@nocobase/service-provider';
import { Boxes, ShieldCheck, UsersRound } from 'lucide-react';

import type { HubClientOptions } from '../plugin.js';
import {
  HUB_APPLICATIONS_ACCESS,
  HUB_USER_ACCESS,
  HUB_USER_ACCESS_NAVIGATION,
} from '../routes.js';

export class HubNavigationProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-hub/navigation';

  public constructor(
    app: ClientApplication,
    private readonly context: ClientServiceProviderContext<HubClientOptions>,
  ) {
    super(app);
  }

  public override boot(): Promise<void> {
    const options = this.context.options;
    const resources: NonNullable<AppClientRefineConfig['resources']> = [
      {
        name: 'hub',
        list: normalizeRoutePath(options.applicationsPath ?? '/hub'),
        meta: {
          access: HUB_APPLICATIONS_ACCESS,
          icon: <Boxes />,
          label: 'navigation.applications',
          i18nNs: '@nocobase/app-plugin-hub',
          order: 10,
        },
      },
    ];
    if (options.userAccessNavigation) {
      resources.push({
        name: HUB_USER_ACCESS_NAVIGATION,
        meta: {
          access: HUB_USER_ACCESS,
          icon: <UsersRound />,
          label: 'navigation.userAccess',
          i18nNs: '@nocobase/app-plugin-hub',
          order: 20,
        },
      });
    }
    if (options.rolesPath) {
      resources.push({
        name: 'hub-roles',
        list: normalizeRoutePath(options.rolesPath),
        meta: {
          access: HUB_USER_ACCESS,
          icon: <ShieldCheck />,
          label: 'navigation.roles',
          i18nNs: '@nocobase/app-plugin-hub',
          order: 20,
          ...(options.userAccessNavigation
            ? { parent: HUB_USER_ACCESS_NAVIGATION }
            : {}),
        },
      });
    }
    this.app.refine.addResources(resources);
    return Promise.resolve();
  }
}

function normalizeRoutePath(value: string): string {
  return `/${value.trim().replace(/^\/+|\/+$/g, '')}`;
}
