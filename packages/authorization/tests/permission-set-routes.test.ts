import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createAuthorization, permissionSets } from '../src/index.js';
import { MockPermissionSetStore } from './mock-permission-set-store.js';

describe('Permission Set handler', () => {
  it('checks the scoped authorization and manages Permission Sets', async () => {
    const authorization = createAuthorization({
      plugins: [permissionSets({ store: new MockPermissionSetStore() })],
    });
    await authorization.permissionSets.create({
      key: 'permission-administrator',
      grants: [
        {
          resource: {
            type: 'authorization.settings',
            id: 'permission-sets',
          },
          actions: [
            { action: 'read' },
            { action: 'create' },
            { action: 'update' },
            { action: 'delete' },
          ],
        },
      ],
    });
    await authorization.permissionSets.assign({
      permissionSet: 'permission-administrator',
      subject: { type: 'user', id: 'admin' },
    });

    const app = new Hono();
    app.on(
      ['GET', 'POST', 'PUT', 'DELETE'],
      ['/authz/permission-sets', '/authz/permission-sets/*'],
      (context) =>
        authorization.permissionSets.handler({
          request: context.req.raw,
          authorization: authorization.for({
            principal: {
              type: 'user',
              id: context.req.header('x-test-user') ?? 'anonymous',
            },
          }),
          basePath: '/authz',
        }),
    );

    expect((await app.request('/authz/permission-sets')).status).toBe(403);

    const missingAssignment = await app.request(
      '/authz/permission-sets/missing/assignments',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user': 'admin',
        },
        body: JSON.stringify({ subject: { type: 'user', id: 'alice' } }),
      },
    );
    expect(missingAssignment.status).toBe(404);

    const invalid = await app.request('/authz/permission-sets', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'admin',
      },
      body: JSON.stringify({ key: 'reader' }),
    });
    expect(invalid.status).toBe(400);

    const created = await app.request('/authz/permission-sets', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'admin',
      },
      body: JSON.stringify({
        key: 'reader',
        grants: [
          {
            resource: { type: 'database.collection', id: 'main.orders' },
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  fields: { output: ['id'] },
                },
              },
            ],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      data: {
        key: 'reader',
        grants: [
          {
            actions: [
              {
                action: 'read',
                policy: {
                  type: 'database',
                  fields: { output: ['id'] },
                },
              },
            ],
          },
        ],
      },
    });

    const assigned = await app.request(
      '/authz/permission-sets/reader/assignments',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-test-user': 'admin',
        },
        body: JSON.stringify({ subject: { type: 'user', id: 'alice' } }),
      },
    );
    expect(assigned.status).toBe(201);

    const effective = await app.request(
      '/authz/permission-sets/effective/user/alice',
      { headers: { 'x-test-user': 'admin' } },
    );
    expect(await effective.json()).toMatchObject({
      data: [{ key: 'reader' }],
    });
  });
});
