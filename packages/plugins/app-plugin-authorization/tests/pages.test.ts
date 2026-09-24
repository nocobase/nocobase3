import { describe, expect, it } from 'vitest';
import {
  createAuthorization,
  permissionSetsPlugin,
} from '@nocobase/authorization';
import { pagesPlugin } from '../server/pages-authorization.js';
import { uiPlugin } from '../server/ui.js';
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
            resource: { type: 'page', id: 'reports' },
            actions: [{ action: 'export' }],
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
    plugins: [permissionSetsPlugin({ store }), pagesPlugin(), uiPlugin()],
  });
  return authorization.for({ principal: { type: 'user', id: 'alice' } });
}

describe('Pages', () => {
  it('is a record type: any page id, only the access action', async () => {
    const authz = setup();

    await expect(
      authz.can({ resource: { type: 'page', id: 'orders' }, action: 'access' }),
    ).resolves.toBe(true);
    await expect(
      authz.can({
        resource: { type: 'page', id: 'settings' },
        action: 'access',
      }),
    ).resolves.toBe(false);
    await expect(
      authz.authorize({
        resource: { type: 'page', id: 'orders' },
        action: 'update',
      }),
    ).resolves.toMatchObject({
      effect: 'deny',
      reasons: [{ code: 'RESOURCE_ACTION_NOT_SUPPORTED' }],
    });
  });

  it('lists exactly the pages can() permits in the snapshot', async () => {
    await expect(setup().snapshot()).resolves.toEqual({
      unrestricted: false,
      permissions: [
        { resource: { type: 'page', id: 'home' }, actions: ['access'] },
        { resource: { type: 'page', id: 'orders' }, actions: ['access'] },
      ],
    });
  });

  it('builds access grants', () => {
    expect(pagesPlugin().authorizationApi?.pages.grant('orders')).toEqual({
      resource: { type: 'page', id: 'orders' },
      actions: [{ action: 'access' }],
    });
  });
});
