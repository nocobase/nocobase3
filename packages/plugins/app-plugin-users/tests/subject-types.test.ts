import type {
  AdministratedUser,
  ListAdministratedUsersInput,
  UserAdministrationService,
} from '@nocobase/app-plugin-authentication';
import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  createAppAuthorization,
} from '@nocobase/app-plugin-authorization';
import type { AppPluginApplication } from '@nocobase/app-server/plugins';
import type { DatabaseConnection } from '@nocobase/db';
import { ServiceContainer } from '@nocobase/service-provider';
import { describe, expect, it } from 'vitest';

import { UsersProvider } from '../server/providers/users.js';

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

function userAdministration(
  enabled: ReadonlySet<string>,
  calls: ListAdministratedUsersInput[],
): UserAdministrationService {
  const service: UserAdministrationService = {
    withConnection: () => service,
    list: (input = {}) => {
      calls.push(input);
      const items = (input.userIds ?? [])
        .filter((id) => enabled.has(id))
        .map((id) => ({ id }) as AdministratedUser);
      return Promise.resolve({
        items,
        total: items.length,
        page: 1,
        pageSize: 100,
      });
    },
    get: () => Promise.resolve(undefined),
    create: () => Promise.reject(new Error('not used')),
    update: () => Promise.reject(new Error('not used')),
    disable: () => Promise.reject(new Error('not used')),
    enable: () => Promise.reject(new Error('not used')),
    resetPassword: () => Promise.reject(new Error('not used')),
    revokeSessions: () => Promise.reject(new Error('not used')),
  };
  return service;
}

describe('the user subject type this plugin declares', () => {
  it('drops a disabled account and asks for the whole batch at once', async () => {
    const container = new ServiceContainer();
    const authorization = createAppAuthorization({ connection });
    const calls: ListAdministratedUsersInput[] = [];
    container.instance(authorizationToken, authorization);
    container.instance(
      userAdministrationServiceToken,
      userAdministration(new Set(['root']), calls),
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

  it('boots an application that has no authorization at all', async () => {
    const container = new ServiceContainer();
    const booting = provider(container);

    await expect(booting.boot()).resolves.toBeUndefined();
    await expect(booting.shutdown()).resolves.toBeUndefined();
  });
});
