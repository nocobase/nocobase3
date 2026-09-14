import { authorizationToken } from '@nocobase/app-plugin-authorization';
import {
  userRoleScopeRegistryToken,
  type UserRoleScopeRegistry,
} from '@nocobase/app-plugin-users/server/tokens';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';

import {
  createHubUserRoleScope,
  protectHubPermissionSets,
  registerHubResources,
} from '../authorization.js';

export class HubAuthorizationProvider extends ServiceProvider<AppPluginApplication> {
  public readonly name: string = '@nocobase/app-plugin-hub/authorization';
  private unregisterProtection?: () => void;
  private unregisterRoleScope?: () => void;

  public override boot(): Promise<void> {
    const authorization = this.app.container.resolve(authorizationToken);
    registerHubResources(authorization);
    this.unregisterProtection = protectHubPermissionSets(authorization);
    this.unregisterRoleScope = this.app.container
      .resolve<UserRoleScopeRegistry>(userRoleScopeRegistryToken)
      .register(createHubUserRoleScope(authorization));
    return Promise.resolve();
  }

  public override shutdown(): Promise<void> {
    this.unregisterRoleScope?.();
    this.unregisterRoleScope = undefined;
    this.unregisterProtection?.();
    this.unregisterProtection = undefined;
    return Promise.resolve();
  }
}
