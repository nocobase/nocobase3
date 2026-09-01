import { describe, expect, it, vi } from 'vitest';

import { databaseManagerToken, type DatabaseManager } from '@nocobase/db';
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
import { authorizationToken } from '../server/tokens.js';

describe('authorization provider', () => {
  it('registers authorization with the service-container database', () => {
    const connection = { kind: 'connection' };
    const database = {
      connection: vi.fn(() => connection),
    } as unknown as DatabaseManager;
    const container = new ServiceContainer();
    container.instance(databaseManagerToken, database);
    const provider = new AuthorizationProvider({
      container,
    });

    provider.register();
    const authorization = container.resolve(authorizationToken);

    expect(provider.name).toBe('@nocobase/app-plugin-authorization');
    expect(createAppAuthorization).toHaveBeenCalledExactlyOnceWith({
      connection,
    });
    expect(authorization).toBe(createAppAuthorization.mock.results[0]?.value);
  });
});
