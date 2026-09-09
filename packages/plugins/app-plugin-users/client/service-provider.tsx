import {
  ClientApplication,
  type ClientServiceProviderContext,
} from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import { UsersRound } from 'lucide-react';

import type { UsersClientOptions } from './plugin.js';
import { normalizeUsersRoutePath, USERS_PAGE_ACCESS } from './routes.js';

const USERS_PACKAGE_NAME = '@nocobase/app-plugin-users';

export class UsersNavigationProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = `${USERS_PACKAGE_NAME}/navigation`;

  public constructor(
    app: ClientApplication,
    private readonly context: ClientServiceProviderContext<UsersClientOptions>,
  ) {
    super(app);
  }

  public override boot(): Promise<void> {
    const options = this.context.options;
    this.app.refine.addResources([
      {
        name: 'users',
        list: normalizeUsersRoutePath(options.path ?? '/users'),
        meta: {
          access: USERS_PAGE_ACCESS,
          icon: <UsersRound />,
          label: options.title ?? 'nav.users',
          i18nNs: USERS_PACKAGE_NAME,
          ...(options.navigationOrder === undefined
            ? {}
            : { order: options.navigationOrder }),
          ...(options.navigationParent
            ? { parent: options.navigationParent }
            : {}),
        },
      },
    ]);
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor<UsersClientOptions>[] =
  [UsersNavigationProvider];

export default serviceProviders;
