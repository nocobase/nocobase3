import { resolvePublicPath } from '../http.js';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import { ServiceProvider } from '@nocobase/service-provider';
import { databaseManagerToken } from '@nocobase/db';
import { cachingToken } from '@nocobase/app-server/caching';
import { idGeneratorToken } from '@nocobase/app-server/id-generator';
import { appConfig } from '@nocobase/app-server/config';
import {
  realtimePrincipalResolverToken,
  type RealtimePrincipal,
} from '@nocobase/app-server/realtime';

import { AuthManager, type AuthOptions } from '../auth-manager.js';
import { createAuthStorage } from '../auth-storage.js';
import { authenticationToken } from '../tokens.js';
import { authenticationConfig, resolveAuthSecret } from '../config.js';

export interface AuthenticationProviderConfig {
  readonly app: {
    readonly name: string;
    readonly publicOrigin: string | undefined;
    readonly publicBasePath: string;
  };
  readonly auth: Omit<AuthOptions, 'basePath' | 'baseURL' | 'connection'> & {
    username?: { enabled?: boolean };
  };
}

export type AuthenticationProviderApplication<
  TConfig extends AuthenticationProviderConfig = AuthenticationProviderConfig,
> = AppPluginApplication<TConfig>;

export class AuthenticationProvider<
  TConfig extends AuthenticationProviderConfig = AuthenticationProviderConfig,
  TApplication extends AuthenticationProviderApplication<TConfig> =
    AuthenticationProviderApplication<TConfig>,
> extends ServiceProvider<TApplication> {
  public readonly name: string = '@nocobase/app-plugin-authentication';

  public override register(): void {
    this.app.container.singleton(authenticationToken, () => new AuthManager());
    if (!this.app.container.has(realtimePrincipalResolverToken)) {
      this.app.container.singleton(
        realtimePrincipalResolverToken,
        (container) => ({
          async resolve(
            request: Request,
          ): Promise<RealtimePrincipal | undefined> {
            const session = await container
              .resolve(authenticationToken)
              .getSession(request.headers);
            return session ? { userId: session.user.id } : undefined;
          },
        }),
      );
    }
  }

  public override async boot(): Promise<void> {
    const { container, config, paths } = this.app;
    const app = config.get(appConfig);
    const { username: _username, ...authConfig } =
      config.get(authenticationConfig);
    const caching = container.resolve(cachingToken);
    const idGenerator = container.resolve(idGeneratorToken);
    const database = container.has(databaseManagerToken)
      ? container.resolve(databaseManagerToken)
      : undefined;
    if (!database)
      throw new Error('Authentication requires a database connection.');
    container.resolve(authenticationToken).init({
      connection: database.connection(),
      secondaryStorage: createAuthStorage(caching),
      appName: app.name,
      ...authConfig,
      secret: resolveAuthSecret(authConfig.secret, paths.root()),
      baseURL: app.publicOrigin,
      basePath: resolvePublicPath('/api/auth', app.publicBasePath),
      advanced: {
        cookiePrefix: createCookiePrefix(app.name),
        ...authConfig.advanced,
        database: {
          ...authConfig.advanced?.database,
          generateId:
            authConfig.advanced?.database?.generateId ??
            (() => idGenerator.generateString()),
        },
        defaultCookieAttributes: {
          path: app.publicBasePath || '/',
          ...authConfig.advanced?.defaultCookieAttributes,
        },
      },
    });
  }
}

export function createCookiePrefix(appName: string): string {
  const normalized = appName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'nocobase3';
}
