import type { User } from '@nocobase/app-plugin-users/server';
import {
  authorizationToken,
  createAppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { DatabaseConnection } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it, vi } from 'vitest';
import type { AuthorizationScope } from '@nocobase/app-plugin-authorization';

import { UsersProvider } from '../server/providers/users.js';
import { userQueryServiceToken } from '../server/tokens.js';
import type {
  ListManagedUsersQuery,
  UserQueryService,
} from '../server/user-queries.js';

/** Permission Sets build their store from it; nothing here queries. */
const connection = { query: {} } as unknown as DatabaseConnection;

function provider(container: ServiceContainer): UsersProvider {
  return new UsersProvider({
    appName: 'test',
    publicBasePath: '',
    config: {} as AppPluginApplication['config'],
    paths: {} as AppPluginApplication['paths'],
    router: {} as AppPluginApplication['router'],
    container,
  });
}

function userQueries(
  enabled: ReadonlySet<string>,
  calls: ListManagedUsersQuery[],
): UserQueryService {
  const service: UserQueryService = {
    withConnection: () => service,
    list: (input = {}) => {
      calls.push(input);
      const items = (input.userIds ?? [])
        .filter((id) => enabled.has(id))
        .map((id) => ({ id }) as User);
      return Promise.resolve({
        items,
        total: items.length,
        page: 1,
        pageSize: 100,
      });
    },
    get: () => Promise.resolve(undefined),
  };
  return service;
}

describe('the user subject type this plugin declares', () => {
  it('drops a disabled account and asks for the whole batch at once', async () => {
    const container = new ServiceContainer();
    const authorization = createAppAuthorization({ connection });
    const calls: ListManagedUsersQuery[] = [];
    container.instance(authorizationToken, authorization);
    container.instance(
      userQueryServiceToken,
      userQueries(new Set(['root']), calls),
    );

    await provider(container).boot();

    await expect(
      authorization.subjects.filterActive([
        { type: 'user', id: 'root' },
        { type: 'user', id: 'retired' },
        { type: 'authenticated', id: '*' },
      ]),
    ).resolves.toEqual([
      { type: 'user', id: 'root' },
      { type: 'authenticated', id: '*' },
    ]);
    expect(calls).toEqual([
      { userIds: ['root', 'retired'], status: 'enabled', pageSize: 100 },
    ]);
  });

  it('checks read permission for both searches and name resolution before querying users', async () => {
    const container = new ServiceContainer();
    const authorization = createAppAuthorization({ connection });
    const calls: ListManagedUsersQuery[] = [];
    container.instance(authorizationToken, authorization);
    container.instance(
      userQueryServiceToken,
      userQueries(new Set(['one']), calls),
    );
    await provider(container).boot();
    const selection =
      authorization.subjects.get('user')?.administration?.selection;
    if (selection?.type !== 'collection') throw new Error('Missing selector');
    const require = vi.fn().mockRejectedValue(new Error('Forbidden'));
    const context = { authz: { require } as unknown as AuthorizationScope };
    await expect(
      selection.list({ search: 'abc', page: 2, pageSize: 30 }, context),
    ).rejects.toThrow('Forbidden');
    await expect(selection.resolve(['one'], context)).rejects.toThrow(
      'Forbidden',
    );
    expect(calls).toEqual([]);
    expect(require).toHaveBeenCalledWith({
      resource: { type: 'user', id: '*' },
      action: 'read',
    });
    require.mockResolvedValue(undefined);
    await selection.list({ search: 'abc', page: 2, pageSize: 30 }, context);
    await selection.resolve(['one'], context);
    expect(calls).toEqual([
      { search: 'abc', page: 2, pageSize: 30, status: 'enabled' },
      { userIds: ['one'], pageSize: 100 },
    ]);
  });

  it('boots an application that has no authorization at all', async () => {
    const container = new ServiceContainer();
    const booting = provider(container);

    await expect(booting.boot()).resolves.toBeUndefined();
    await expect(booting.shutdown()).resolves.toBeUndefined();
  });
});
