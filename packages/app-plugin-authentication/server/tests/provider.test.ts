import { describe, expect, it, vi } from 'vitest';

import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import { ServiceContainer } from '@nocobase/service-provider';
import { cachingToken, type Caching } from '@nocobase/caching';
import { idGeneratorToken } from '@nocobase/id-generator';

const authHandler = vi.hoisted(() =>
  vi.fn((request: Request) => Promise.resolve(new Response(request.url))),
);
const createAuthentication = vi.hoisted(() =>
  vi.fn(() => ({ handler: authHandler })),
);

vi.mock('../auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth.js')>();
  return { ...actual, createAuthentication };
});

import AuthenticationProvider, {
  createCookiePrefix,
  resolvePublicPath,
  toPublicRequest,
  type AuthenticationProviderConfig,
} from '../provider.js';
import { authenticationToken } from '../token.js';

describe('authentication provider', () => {
  it('registers authentication with the application runtime and dependencies', async () => {
    const connection = { kind: 'connection' };
    const database = {
      connection: vi.fn(() => connection),
    } as unknown as DatabaseManager;
    const caching = {
      getCache: vi.fn(() => ({
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        take: vi.fn(),
      })),
      getCounter: vi.fn(() => ({ increment: vi.fn() })),
    } as unknown as Caching;
    const idGenerator = {
      generate: vi.fn(() => 1),
      generateString: vi.fn(() => 'generated-id'),
    };
    const container = new ServiceContainer();
    const config = createConfig();
    container.instance(databaseManagerToken, database);
    container.instance(cachingToken, caching);
    container.instance(idGeneratorToken, idGenerator);
    const provider = new AuthenticationProvider({
      config,
      container,
    });

    provider.register();
    const auth = container.resolve(authenticationToken);

    expect(provider.name).toBe('@nocobase/app-plugin-authentication');
    expect(createAuthentication).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        connection,
        appName: 'main app',
        baseURL: 'https://example.com',
        basePath: '/main/api/auth',
        advanced: expect.objectContaining({
          cookiePrefix: 'main-app',
          defaultCookieAttributes: { path: '/main' },
        }),
      }),
    );

    const generateId =
      createAuthentication.mock.calls[0]?.[0].advanced?.database?.generateId;
    expect(generateId?.({ model: 'user', size: 12 })).toBe('generated-id');

    const response = await auth.handler(
      new Request('http://localhost/api/auth/get-session'),
    );
    await expect(response.text()).resolves.toBe(
      'http://localhost/main/api/auth/get-session',
    );
  });

  it('normalizes public paths, requests, and cookie prefixes', async () => {
    expect(resolvePublicPath('/api/auth', '/main')).toBe('/main/api/auth');
    expect(resolvePublicPath('/api/auth', '')).toBe('/api/auth');
    expect(resolvePublicPath('/', '/main')).toBe('/main/');
    expect(createCookiePrefix(' Main App ')).toBe('main-app');
    expect(createCookiePrefix('---')).toBe('nocobase3');

    const request = new Request(
      'http://localhost/api/auth/sign-in/username?from=login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-test': 'value' },
        body: JSON.stringify({ username: 'admin' }),
        duplex: 'half',
      },
    );
    const publicRequest = toPublicRequest(request, '/main');

    expect(publicRequest.url).toBe(
      'http://localhost/main/api/auth/sign-in/username?from=login',
    );
    expect(publicRequest.headers.get('x-test')).toBe('value');
    await expect(publicRequest.json()).resolves.toEqual({ username: 'admin' });
  });
});

function createConfig(): AuthenticationProviderConfig {
  return {
    app: {
      name: 'main app',
      publicOrigin: 'https://example.com',
      publicBasePath: '/main',
    },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  };
}
