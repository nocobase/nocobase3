import { createAuthorization } from './authorization-fixture.js';
import { createPermissionSetHandler } from '../server/management/permission-sets.js';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { permissionSets } from '@nocobase/authorization';
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
            type: 'settings',
            id: 'authorization.permission-sets',
          },
          actions: [
            { action: 'read' },
            { action: 'create' },
            { action: 'update' },
            { action: 'delete' },
            { action: 'assign' },
          ],
        },
      ],
    });
    await authorization.permissionSets.assign({
      permissionSet: 'permission-administrator',
      subject: { type: 'user', id: 'admin' },
    });

    const router = new Hono();
    router.on(
      ['GET', 'POST', 'PUT', 'DELETE'],
      ['/authz/permission-sets', '/authz/permission-sets/*'],
      (context) =>
        createPermissionSetHandler(authorization.permissionSets)({
          request: context.req.raw,
          authorization: authorization.for({
            principal: {
              type: 'user',
              id: context.req.header('x-test-user') ?? 'anonymous',
            },
          }),
          path: context.req.path.slice('/authz'.length),
        }),
    );

    expect((await router.request('/authz/permission-sets')).status).toBe(403);

    const missingAssignment = await router.request(
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

    const invalid = await router.request('/authz/permission-sets', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-test-user': 'admin',
      },
      body: JSON.stringify({ key: 'reader' }),
    });
    expect(invalid.status).toBe(400);

    const created = await router.request('/authz/permission-sets', {
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
                  fields: ['id'],
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
                  fields: ['id'],
                },
              },
            ],
          },
        ],
      },
    });

    const assigned = await router.request(
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

    const effective = await router.request(
      '/authz/permission-sets/effective/user/alice',
      { headers: { 'x-test-user': 'admin' } },
    );
    expect(await effective.json()).toMatchObject({
      data: [{ key: 'reader' }],
    });
  });

  it('refuses generic writes to protected Permission Sets', async () => {
    const authorization = createAuthorization({
      plugins: [permissionSets({ store: new MockPermissionSetStore() })],
    });
    await authorization.permissionSets.create({
      key: 'administrator',
      grants: [
        {
          resource: { type: 'settings', id: '*' },
          actions: [
            { action: 'read' },
            { action: 'create' },
            { action: 'update' },
            { action: 'delete' },
            { action: 'assign' },
          ],
        },
      ],
    });
    await authorization.permissionSets.assign({
      permissionSet: 'administrator',
      subject: { type: 'user', id: 'admin' },
    });
    const release = authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['administrator', 'reserved'],
      allow: ['assign'],
    });
    expect(() =>
      authorization.permissionSets.protect({
        owner: '@nocobase/other',
        keys: ['administrator'],
      }),
    ).toThrow('already protected by @nocobase/test');
    expect(authorization.permissionSets.protection('administrator')).toEqual({
      owner: '@nocobase/test',
      allow: ['assign'],
    });

    const admin = {
      'content-type': 'application/json',
      'x-test-user': 'admin',
    };
    const router = new Hono();
    router.on(
      ['GET', 'POST', 'PUT', 'DELETE'],
      ['/permission-sets', '/permission-sets/*'],
      (context) =>
        createPermissionSetHandler(authorization.permissionSets)({
          request: context.req.raw,
          authorization: authorization.for({
            principal: { type: 'user', id: 'admin' },
          }),
          path: context.req.path,
        }),
    );
    const protectedResponse = async (response: Response): Promise<void> => {
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: 'PROTECTED_PERMISSION_SET',
      });
    };

    await protectedResponse(
      await router.request('/permission-sets', {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ key: 'reserved', grants: [] }),
      }),
    );
    await protectedResponse(
      await router.request('/permission-sets/administrator', {
        method: 'PUT',
        headers: admin,
        body: JSON.stringify({ key: 'administrator', grants: [] }),
      }),
    );
    await protectedResponse(
      await router.request('/permission-sets/administrator', {
        method: 'DELETE',
        headers: admin,
      }),
    );
    await protectedResponse(
      await router.request(
        '/permission-sets/assignments/user:admin:administrator',
        { method: 'DELETE', headers: admin },
      ),
    );
    // Renaming another set onto a protected key is refused too.
    await authorization.permissionSets.create({ key: 'plain', grants: [] });
    await protectedResponse(
      await router.request('/permission-sets/plain', {
        method: 'PUT',
        headers: admin,
        body: JSON.stringify({ key: 'reserved', grants: [] }),
      }),
    );

    // Allowed operations pass through, and the owner's own API calls are never blocked.
    const assigned = await router.request(
      '/permission-sets/administrator/assignments',
      {
        method: 'POST',
        headers: admin,
        body: JSON.stringify({ subject: { type: 'user', id: 'bob' } }),
      },
    );
    expect(assigned.status).toBe(201);
    await expect(
      authorization.permissionSets.update('administrator', {
        key: 'administrator',
        title: 'Administrator',
        grants: (await authorization.permissionSets.get('administrator'))!
          .grants,
      }),
    ).resolves.toMatchObject({ key: 'administrator', title: 'Administrator' });

    release();
    expect(authorization.permissionSets.protection('administrator')).toBe(
      undefined,
    );
    const deleted = await router.request('/permission-sets/administrator', {
      method: 'DELETE',
      headers: admin,
    });
    expect(deleted.status).toBe(204);
  });
  it('reports protection and unrestricted access from the read endpoints', async () => {
    const authorization = createAuthorization({
      plugins: [permissionSets({ store: new MockPermissionSetStore() })],
    });
    await authorization.permissionSets.create({
      key: 'administrator',
      grants: [
        {
          resource: { type: 'settings', id: '*' },
          actions: [{ action: 'read' }],
        },
      ],
    });
    await authorization.permissionSets.create({ key: 'superuser', grants: [] });
    await authorization.permissionSets.create({ key: 'reader', grants: [] });
    await authorization.permissionSets.assign({
      permissionSet: 'administrator',
      subject: { type: 'user', id: 'admin' },
    });
    authorization.permissionSets.protect({
      owner: '@nocobase/test',
      keys: ['superuser'],
      allow: ['assign', 'revoke'],
      unrestricted: true,
    });

    const router = new Hono();
    router.on(
      ['GET', 'POST', 'PUT', 'DELETE'],
      ['/permission-sets', '/permission-sets/*'],
      (context) =>
        createPermissionSetHandler(authorization.permissionSets)({
          request: context.req.raw,
          authorization: authorization.for({
            principal: { type: 'user', id: 'admin' },
          }),
          path: context.req.path,
        }),
    );

    const listed = await router.request('/permission-sets');
    expect(await listed.json()).toEqual({
      data: [
        {
          key: 'administrator',
          grants: [
            {
              resource: { type: 'settings', id: '*' },
              actions: [{ action: 'read' }],
            },
          ],
        },
        {
          key: 'superuser',
          grants: [],
          protection: {
            owner: '@nocobase/test',
            allow: ['assign', 'revoke'],
            unrestricted: true,
          },
          unrestricted: true,
        },
        // An ordinary set carries neither field rather than carrying them as undefined.
        { key: 'reader', grants: [] },
      ],
    });

    const single = await router.request('/permission-sets/superuser');
    expect(await single.json()).toEqual({
      data: {
        key: 'superuser',
        grants: [],
        protection: {
          owner: '@nocobase/test',
          allow: ['assign', 'revoke'],
          unrestricted: true,
        },
        unrestricted: true,
      },
    });
    expect(
      await (await router.request('/permission-sets/reader')).json(),
    ).toEqual({ data: { key: 'reader', grants: [] } });
  });
});

it('separates editing permission sets from managing assignments', async () => {
  const authorization = createAuthorization({
    plugins: [permissionSets({ store: new MockPermissionSetStore() })],
  });
  await authorization.permissionSets.create({ key: 'target', grants: [] });
  for (const action of ['update', 'assign']) {
    await authorization.permissionSets.create({
      key: action,
      grants: [
        {
          resource: { type: 'settings', id: 'authorization.permission-sets' },
          actions: [{ action }],
        },
      ],
    });
    await authorization.permissionSets.assign({
      permissionSet: action,
      subject: { type: 'user', id: action },
    });
  }
  const handler = createPermissionSetHandler(authorization.permissionSets);
  const call = (user: string, path: string, method: string, body: unknown) =>
    handler({
      request: new Request(`http://test${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      authorization: authorization.for({
        principal: { type: 'user', id: user },
      }),
      path,
    });
  const assignment = { subject: { type: 'user', id: 'alice' } };
  expect(
    (
      await call('update', '/permission-sets/target', 'PUT', {
        key: 'target',
        title: 'Edited',
        grants: [],
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        'update',
        '/permission-sets/target/assignments',
        'POST',
        assignment,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call('assign', '/permission-sets/target', 'PUT', {
        key: 'target',
        grants: [],
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        'assign',
        '/permission-sets/target/assignments',
        'POST',
        assignment,
      )
    ).status,
  ).toBe(201);
  const [created] =
    await authorization.permissionSets.listAssignments('target');
  expect(
    (
      await call(
        'assign',
        `/permission-sets/assignments/${created.id}`,
        'DELETE',
        null,
      )
    ).status,
  ).toBe(204);
});
