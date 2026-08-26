import { describe, expect, it } from 'vitest';
import { createAuthorization, pages, permissionSets } from '../src/index.js';
import { MockPermissionSetStore } from './mock-permission-set-store.js';

function setup() {
  const store = new MockPermissionSetStore({
    permissionSets: [
      {
        key: 'portal-user',
        grants: [
          {
            resource: { type: 'page', id: 'home' },
            actions: [{ action: 'access' }],
          },
          {
            resource: { type: 'page', id: 'orders' },
            actions: [{ action: 'access' }],
          },
          {
            resource: { type: 'database.collection', id: 'main.orders' },
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  recordAccess: ['recordsIOwn'],
                },
              },
            ],
          },
        ],
      },
    ],
    assignments: [
      {
        id: 'portal-user-alice',
        subject: { type: 'user', id: 'alice' },
        permissionSet: 'portal-user',
      },
    ],
  });
  const authorization = createAuthorization({
    plugins: [permissionSets({ store }), pages()],
  });
  return {
    authorization,
    authz: authorization.for({
      principal: { type: 'user', id: 'alice' },
    }),
  };
}

describe('Pages', () => {
  it('authorizes page access through the installed Grant Provider', async () => {
    const { authz } = setup();

    await expect(
      authz.can({
        resource: { type: 'page', id: 'orders' },
        action: 'access',
      }),
    ).resolves.toBe(true);
    await expect(
      authz.can({
        resource: { type: 'page', id: 'settings' },
        action: 'access',
      }),
    ).resolves.toBe(false);
    await expect(
      authz.can({
        resource: { type: 'page', id: 'orders' },
        action: 'update',
      }),
    ).resolves.toBe(false);
  });

  it('returns static permissions for the current identity', async () => {
    const { authz } = setup();

    await expect(authz.permissions()).resolves.toEqual({
      permissions: [
        { resource: { type: 'page', id: 'home' }, actions: ['access'] },
        { resource: { type: 'page', id: 'orders' }, actions: ['access'] },
      ],
    });
  });

  it('serves the current identity permissions through the Core handler', async () => {
    const { authorization, authz } = setup();
    const response = await authorization.permissions.handler({
      request: new Request('http://localhost/authorization/permissions'),
      authorization: authz,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        permissions: [
          { resource: { type: 'page', id: 'home' }, actions: ['access'] },
          { resource: { type: 'page', id: 'orders' }, actions: ['access'] },
        ],
      },
    });
  });
});
