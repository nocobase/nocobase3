import { ServiceProvider } from '@nocobase/service-provider';
import type { ClientApplication } from '@nocobase/app-client';
import { resolveAppUrl, realtimeClientToken } from '@nocobase/app-client';
import type { ClientServiceProviderConstructor } from '@nocobase/app-client/plugins';

import {
  createAuthClient,
  type AuthConfig,
  type AuthClient,
} from './auth-client.js';
import { createAuthProvider } from './auth-provider.js';
import type { AuthenticationClientOptions } from './plugin.js';

export class AuthenticationServiceProvider extends ServiceProvider<ClientApplication> {
  public readonly name: string = '@nocobase/app-plugin-authentication/client';

  public override boot(): Promise<void> {
    const apiBaseURL =
      this.app.config.get<string>('api.baseURL') ?? resolveAppUrl('/api');
    const authClient = createAuthClient({
      baseURL: new URL(
        `${apiBaseURL.replace(/\/+$/u, '')}/auth`,
        window.location.origin,
      ).href,
      ...this.app.config.get<AuthConfig>('auth'),
    });
    this.app.refine.setAuthProvider(
      createAuthProvider(
        authClient as AuthClient,
        this.app.container.resolve(realtimeClientToken),
      ),
    );
    return Promise.resolve();
  }
}

const serviceProviders: readonly ClientServiceProviderConstructor<AuthenticationClientOptions>[] =
  [AuthenticationServiceProvider];

export default serviceProviders;
