import { ServiceProvider } from '@nocobase/service-provider';
import type { ClientApplication } from '@nocobase/app-client';
import { apiClientToken, realtimeClientToken } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

import { createAuthClient } from './auth-client.js';
import { createAuthProvider } from './auth-provider.js';
import type { AuthenticationClientOptions } from './plugin.js';

export class AuthenticationServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-authentication/client';

  public override boot(): Promise<void> {
    const authClient = createAuthClient({
      api: this.app.container.resolve(apiClientToken),
      realtime: this.app.container.resolve(realtimeClientToken),
    });
    this.app.refine.setAuthProvider(createAuthProvider(authClient));
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor<AuthenticationClientOptions>[] =
  [AuthenticationServiceProvider];

export default serviceProviders;
