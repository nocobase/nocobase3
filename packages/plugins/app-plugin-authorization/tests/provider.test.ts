import { beforeEach, describe, expect, it, vi } from 'vitest';

import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
import { realtimeServiceToken } from '@nocobase/app-server/realtime';
import { ServiceContainer } from '@nocobase/service-provider';

const createAppAuthorization = vi.hoisted(() =>
  vi.fn(() => ({ kind: 'authorization' })),
);

vi.mock('../server/authorization.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../server/authorization.js')>();
  return { ...actual, createAppAuthorization };
});

import { AuthorizationProvider } from '../server/providers/authorization.js';
import type { AuthorizationConfig } from '../server/authorization.js';
import { pages } from '../server/pages-authorization.js';
import { authorizationToken } from '../server/tokens.js';

describe('authorization provider', () => {
  beforeEach(() => {
    createAppAuthorization.mockClear();
  });

  it('registers authorization with the service-container database', () => {
    const plugins = [pages()];
    const connection = { kind: 'connection' };
    const database = {
      connection: vi.fn(() => connection),
    } as unknown as DatabaseManager;
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, database);
    const provider = new AuthorizationProvider({
      container,
      config: appConfig({ plugins }),
    });

    provider.register();
    const authorization = container.resolve(authorizationToken);

    expect(provider.name).toBe('@nocobase/app-plugin-authorization');
    expect(createAppAuthorization).toHaveBeenCalledExactlyOnceWith({
      connection,
      config: { plugins },
      onAuthenticatedPermissionsChanged: expect.any(Function),
      onUserPermissionsChanged: expect.any(Function),
    });
    expect(authorization).toBe(createAppAuthorization.mock.results[0]?.value);
  });

  // The provider hands over what the application configured and invents
  // nothing; an application that configures nothing installs nothing.
  it('passes no configuration when the application declares none', () => {
    const container = new ServiceContainer();
    const provider = new AuthorizationProvider({
      container,
      config: appConfig(undefined),
    });

    provider.register();
    container.resolve(authorizationToken);

    expect(createAppAuthorization.mock.calls[0]?.[0]?.config).toBeUndefined();
  });

  it('publishes targeted and global permission invalidations', async () => {
    const container = new ServiceContainer();
    const publishFor = vi.fn();
    const publish = vi.fn();
    const closeUser = vi.fn();
    const closeGlobal = vi.fn();
    const defineTopic = vi
      .fn()
      .mockReturnValueOnce({ publishFor, close: closeUser })
      .mockReturnValueOnce({ publish, close: closeGlobal });
    container.instance(realtimeServiceToken, { defineTopic } as never);
    const provider = new AuthorizationProvider({
      container,
      config: appConfig(undefined),
    });

    provider.register();
    container.resolve(authorizationToken);
    await provider.boot();
    const options = createAppAuthorization.mock.calls[0]?.[0];
    await options?.onUserPermissionsChanged?.('user-1');
    await options?.onAuthenticatedPermissionsChanged?.();

    expect(publishFor).toHaveBeenCalledWith('user-1', {
      type: 'permissions-changed',
    });
    expect(publish).toHaveBeenCalledWith({ type: 'permissions-changed' });

    await provider.shutdown();
    expect(closeUser).toHaveBeenCalledOnce();
    expect(closeGlobal).toHaveBeenCalledOnce();
  });
});

function appConfig(authorization: AuthorizationConfig | undefined) {
  return { get: vi.fn(() => authorization) };
}
