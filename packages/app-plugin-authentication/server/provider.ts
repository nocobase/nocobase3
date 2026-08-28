import {
  joinBasePath,
  normalizeBasePath,
} from '@nocobase/app-server-kit/support';
import {
  ServiceProvider,
  type ServiceResolver,
} from '@nocobase/service-provider';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { databaseManagerToken } from '@nocobase/app-database';
import { cachingToken } from '@nocobase/caching';
import { idGeneratorToken } from '@nocobase/id-generator';

import {
  createAuthentication,
  type Auth,
  type CreateAuthenticationOptions,
} from './auth.js';
import { createAuthStorage } from './auth-storage.js';
import { authenticationToken } from './token.js';

interface RequestInitWithDuplex extends RequestInit {
  duplex?: 'half';
}

export interface AuthenticationProviderConfig {
  readonly app: {
    readonly name: string;
    readonly publicOrigin: string | undefined;
    readonly publicBasePath: string;
  };
  readonly auth: Omit<
    CreateAuthenticationOptions,
    'basePath' | 'baseURL' | 'connection'
  >;
}

export default class AuthenticationProvider<
  TConfig extends AuthenticationProviderConfig = AuthenticationProviderConfig,
> extends ServiceProvider<AppRuntime<TConfig>> {
  public readonly name: string = '@nocobase/app-plugin-authentication';

  public override register(): void {
    this.context.serviceContainer.singleton(authenticationToken, (services) =>
      this.createAuthentication(services),
    );
  }

  private createAuthentication(services: ServiceResolver): Auth {
    const { config } = this.context.runtime;
    const caching = services.resolve(cachingToken);
    const idGenerator = services.resolve(idGeneratorToken);
    const database = services.has(databaseManagerToken)
      ? services.resolve(databaseManagerToken)
      : undefined;
    const auth = createAuthentication({
      connection: database?.connection(),
      secondaryStorage: createAuthStorage(caching),
      appName: config.app.name,
      ...config.auth,
      baseURL: config.app.publicOrigin,
      basePath: resolvePublicPath('/api/auth', config.app.publicBasePath),
      advanced: {
        cookiePrefix: createCookiePrefix(config.app.name),
        ...config.auth.advanced,
        database: {
          ...config.auth.advanced?.database,
          generateId:
            config.auth.advanced?.database?.generateId ??
            (() => idGenerator.generateString()),
        },
        defaultCookieAttributes: {
          path: config.app.publicBasePath || '/',
          ...config.auth.advanced?.defaultCookieAttributes,
        },
      },
    });
    const originalAuthHandler = auth.handler.bind(auth);
    auth.handler = (request: Request): Promise<Response> =>
      originalAuthHandler(toPublicRequest(request, config.app.publicBasePath));
    return auth;
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

/** Resolves an app-local pathname to the path exposed by the app runtime. */
export function resolvePublicPath(
  appLocalPath: string,
  publicBasePath: string,
): string {
  const basePath = normalizeBasePath(publicBasePath);
  const localPath = normalizeBasePath(appLocalPath);

  if (!basePath) {
    return localPath || '/';
  }

  return localPath ? joinBasePath(basePath, localPath) : `${basePath}/`;
}

/** Restores the public mount path on an app-local request. */
export function toPublicRequest(
  request: Request,
  publicBasePath: string,
): Request {
  if (!normalizeBasePath(publicBasePath)) {
    return request;
  }

  const url = new URL(request.url);
  url.pathname = resolvePublicPath(url.pathname, publicBasePath);

  const init: RequestInitWithDuplex = {
    method: request.method,
    headers: request.headers,
    signal: request.signal,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  return new Request(url, init);
}
