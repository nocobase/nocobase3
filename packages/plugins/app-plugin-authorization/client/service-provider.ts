import {
  apiClientToken,
  ClientApplication,
  realtimeClientToken,
} from '@nocobase/app-client';
import type { AppClientRefineConfig } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { configureAuthorizationClient } from './runtime.js';
import { authorizationClientToken } from './tokens.js';
import {
  AUTHORIZATION_GLOBAL_PERMISSIONS_CHANGED_TOPIC,
  AUTHORIZATION_PERMISSIONS_CHANGED_TOPIC,
} from '../shared.js';

export class AuthorizationServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-authorization/client';
  private unsubscribePermissionsChanged?: () => void;
  private unsubscribeGlobalPermissionsChanged?: () => void;
  private unsubscribeRealtimeOpen?: () => void;

  public override register(): void {
    this.app.container.singleton(authorizationClientToken, (resolver) =>
      configureAuthorizationClient(resolver.resolve(apiClientToken)),
    );
  }

  public override boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationClientToken);
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
    const realtime = this.app.container.resolve(realtimeClientToken);
    this.unsubscribePermissionsChanged = realtime.subscribe(
      AUTHORIZATION_PERMISSIONS_CHANGED_TOPIC,
      () => {
        authz.invalidatePermissions();
      },
    );
    this.unsubscribeGlobalPermissionsChanged = realtime.subscribe(
      AUTHORIZATION_GLOBAL_PERMISSIONS_CHANGED_TOPIC,
      () => {
        authz.invalidatePermissions();
      },
    );
    this.unsubscribeRealtimeOpen = realtime.onOpen(() => {
      authz.invalidatePermissions();
    });
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.unsubscribePermissionsChanged?.();
    this.unsubscribePermissionsChanged = undefined;
    this.unsubscribeGlobalPermissionsChanged?.();
    this.unsubscribeGlobalPermissionsChanged = undefined;
    this.unsubscribeRealtimeOpen?.();
    this.unsubscribeRealtimeOpen = undefined;
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
