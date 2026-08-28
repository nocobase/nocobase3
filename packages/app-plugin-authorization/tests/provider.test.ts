import { describe, expect, it, vi } from 'vitest';

import {
  databaseManagerToken,
  type DatabaseManager,
} from '@nocobase/app-database';
import { createConfigPaths } from '@nocobase/app-server-kit/config';
import type { AppRuntime } from '@nocobase/app-server-kit/runtime';
import { ServiceContainer } from '@nocobase/service-provider';

const createAppAuthorization = vi.hoisted(() =>
  vi.fn(() => ({ kind: 'authorization' })),
);

vi.mock('../server/authorization.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../server/authorization.js')>();
  return { ...actual, createAppAuthorization };
});

import AuthorizationProvider from '../server/provider.js';
import { authorizationToken } from '../server/token.js';

describe('authorization provider', () => {
  it('registers authorization with the service-container database', () => {
    const connection = { kind: 'connection' };
    const database = {
      connection: vi.fn(() => connection),
    } as unknown as DatabaseManager;
    const serviceContainer = new ServiceContainer();
    serviceContainer.instance(databaseManagerToken, database);
    const provider = new AuthorizationProvider({
      runtime: createRuntime(),
      serviceContainer,
    });

    provider.register();
    const authorization = serviceContainer.resolve(authorizationToken);

    expect(provider.name).toBe('@nocobase/app-plugin-authorization');
    expect(createAppAuthorization).toHaveBeenCalledExactlyOnceWith({
      connection,
    });
    expect(authorization).toBe(createAppAuthorization.mock.results[0]?.value);
  });
});

function createRuntime(): AppRuntime<undefined> {
  return {
    config: undefined,
    paths: createConfigPaths({ rootDir: process.cwd() }),
  };
}
