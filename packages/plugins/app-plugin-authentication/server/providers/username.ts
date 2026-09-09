import { username } from 'better-auth/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import type { AuthenticationProviderApplication } from './authentication.js';
import { authenticationConfig } from '../config.js';
import { authenticationToken } from '../tokens.js';

export class UsernameProvider extends ServiceProvider<AuthenticationProviderApplication> {
  public readonly name: string = '@nocobase/app-plugin-authentication/username';

  public override register(): void {
    const config = this.app.config.get(authenticationConfig);
    if (config.username?.enabled === false) return;
    this.app.container
      .resolve(authenticationToken)
      .plugin(username({ displayUsername: false }));
  }
}
