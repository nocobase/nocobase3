import {
  apiClientToken,
  ClientApplication,
  realtimeClientToken,
} from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import { AuthorizationClient } from './authorization-client.js';
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
    this.app.container.singleton(
      authorizationClientToken,
      (resolver) => new AuthorizationClient(resolver.resolve(apiClientToken)),
    );
  }

  public override boot(): Promise<void> {
    const authz = this.app.container.resolve(authorizationClientToken);
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
