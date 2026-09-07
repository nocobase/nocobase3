import { apiClientToken, ClientApplication } from '@nocobase/app-client';
import type { AppClientRefineConfig } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureAuthorizationClient } from './runtime.js';

export class AuthorizationServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-authorization/client';

  public override boot(): Promise<void> {
    const authz = configureAuthorizationClient(
      this.app.container.resolve(apiClientToken),
    );
    const accessControlProvider: NonNullable<
      AppClientRefineConfig['accessControlProvider']
    > = {
      async can({ resource, action }) {
        if (!resource) return { can: false };
        if (resource === 'authorization') return { can: true };
        if (resource.startsWith('authorization.settings.')) {
          return {
            can: await authz.can(
              {
                type: 'authorization.settings',
                id: resource.slice('authorization.settings.'.length),
              },
              administrationAction(action),
            ),
          };
        }
        return {
          can: await authz.can({ type: 'page', id: resource }, 'access'),
        };
      },
    };
    this.app.refine.setAccessControlProvider(accessControlProvider);
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor[] = [
  AuthorizationServiceProvider,
];

export default serviceProviders;

function administrationAction(action: string): string {
  switch (action) {
    case 'list':
    case 'show':
      return 'read';
    case 'edit':
      return 'update';
    case 'delete':
      return 'delete';
    default:
      return action;
  }
}
