import { describe, expect, it } from 'vitest';
import {
  createAuthorization,
  permissionSetsPlugin,
} from '@nocobase/authorization';
import { pagesPlugin } from '../../server/pages-authorization.js';
import { settingsPlugin } from '../../server/settings.js';
import { uiPlugin } from '../../server/ui.js';
import { MockPermissionSetStore } from '../helpers/mock-permission-set-store.js';

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

describe('pages and settings', () => {
  it('is a record type: any page id, only the access action, listed in the snapshot exactly as can() permits', async () => {
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
    await expect(authz.snapshot()).resolves.toEqual({
      unrestricted: false,
      permissions: [
        { resource: { type: 'page', id: 'home' }, actions: ['access'] },
        { resource: { type: 'page', id: 'orders' }, actions: ['access'] },
      ],
    });
  });

  it('builds page access and settings grants', () => {
    expect(pagesPlugin().authorizationApi?.pages.grant('orders')).toEqual({
      resource: { type: 'page', id: 'orders' },
      actions: [{ action: 'access' }],
    });
    const settings = settingsPlugin();
    createAuthorization({ plugins: [settings] });
    settings.authorizationApi!.settings.add({
      id: 'workflow',
      title: 'Workflow',
      actions: [{ name: 'manage' }],
    });
    expect(
      settings.authorizationApi!.settings.grant('workflow', ['manage']),
    ).toEqual({
      resource: { type: 'settings', id: 'workflow' },
      actions: [{ action: 'manage' }],
    });
    expect(() =>
      settings.authorizationApi!.settings.grant('workflow', ['delete']),
    ).toThrow('has no action delete');
    expect(() =>
      settings.authorizationApi!.settings.grant('missing', ['manage']),
    ).toThrow('Unknown settings item');
  });
});
