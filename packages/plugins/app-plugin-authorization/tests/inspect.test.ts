import { createConfigPaths } from '@nocobase/app-server/config';
import {
  authenticationToken,
  type Auth,
} from '@nocobase/app-plugin-authentication';
import { createAuthorization, permissionSets } from '@nocobase/authorization';
import type {
  AuthorizationDecision,
  AuthorizationPlugin,
} from '@nocobase/authorization/core';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { apiRoutes } from '../server/routes/index.js';
import { authorizationToken, type Authorization } from '../server/index.js';
import { MockPermissionSetStore } from './mock-permission-set-store.js';

/**
 * A resource type answering with whichever effect the id asks for, so the
 * endpoint is tested against the core's own shapes rather than one plugin's.
 */
const decisions: AuthorizationPlugin = {
  id: 'test-decisions',
  setup(authz) {
    authz.resources.add({
      resourceType: 'test.resource',
      authorize: (request): Promise<AuthorizationDecision> =>
        Promise.resolve(
          request.resource.id === 'conditional'
            ? {
                effect: 'conditional',
                conditions: { type: 'filter', field: 'ownerId' },
                reasons: [
                  {
                    code: 'SCOPED',
                    message: 'Records the person owns',
                    plugin: 'test-decisions',
                  },
                ],
              }
            : request.resource.id === 'permitted'
              ? {
                  effect: 'permit',
                  reasons: [
                    {
                      code: 'GRANTED',
                      message: 'A permission set grants it',
                      plugin: 'test-decisions',
                    },
                  ],
                }
              : {
                  effect: 'deny',
                  reasons: [{ code: 'NO_GRANT', message: 'Nothing grants it' }],
                },
        ),
    });
  },
};

describe('the permission inspector endpoint', () => {
  it('checks a bounded batch and requires the same settings permission', async () => {
    const payload = {
      subject: { type: 'user', id: 'alice' },
      checks: ['permitted', 'conditional', 'denied'].map((id) => ({
        resource: { type: 'test.resource', id },
        action: 'read',
      })),
    };
    const send = (router: Hono, value: unknown) =>
      router.request('/api/authz/inspect/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(value),
      });
    const forbidden = await mountedRouter(
      await authorization({ settings: false }),
    );
    expect((await send(forbidden, payload)).status).toBe(403);
    const router = await mountedRouter(await authorization({ settings: true }));
    const response = await send(router, payload);
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      data: { decision: AuthorizationDecision }[];
    };
    expect(result.data.map((item) => item.decision.effect)).toEqual([
      'permit',
      'conditional',
      'deny',
    ]);
    for (const invalid of [
      null,
      {},
      { ...payload, checks: [] },
      {
        ...payload,
        checks: Array.from({ length: 101 }, () => payload.checks[0]),
      },
      { ...payload, checks: [null] },
    ]) {
      expect((await send(router, invalid)).status).toBe(400);
    }
  });

  it('inspects non-user subjects without adding authenticated-user grants', async () => {
    const authz = await authorization({ settings: true });
    const seen: unknown[] = [];
    authz.resources.add({
      resourceType: 'subject-check',
      authorize(request) {
        seen.push({ principal: request.principal, subjects: request.subjects });
        return Promise.resolve({ effect: 'permit', reasons: [] });
      },
    });
    const router = await mountedRouter(authz);
    for (const subject of [
      { type: 'department', id: 'sales' },
      { type: 'authenticated', id: '*' },
      { type: 'user', id: 'alice' },
    ]) {
      const response = await router.request('/api/authz/inspect/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subject,
          checks: [
            { resource: { type: 'subject-check', id: 'test' }, action: 'read' },
          ],
        }),
      });
      expect(response.status).toBe(200);
    }
    expect(seen).toEqual([
      { principal: { type: 'department', id: 'sales' }, subjects: [] },
      { principal: { type: 'authenticated', id: '*' }, subjects: [] },
      {
        principal: { type: 'user', id: 'alice' },
        subjects: [{ type: 'authenticated', id: '*' }],
      },
    ]);
  });

  it('summarizes configured types including policy grants and enforces settings access', async () => {
    const send = (router: Hono) =>
      router.request('/api/authz/inspect/configured', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: { type: 'department', id: 'sales' } }),
      });
    expect(
      (
        await send(
          await mountedRouter(await authorization({ settings: false })),
        )
      ).status,
    ).toBe(403);
    const authz = await authorization({ settings: true });
    await authz.permissionSets.create({
      key: 'sales',
      grants: [
        {
          resource: { type: 'database.collection', id: '*' },
          actions: [{ action: 'read', policy: { type: 'database' } }],
        },
      ],
    });
    await authz.permissionSets.assign({
      permissionSet: 'sales',
      subject: { type: 'department', id: 'sales' },
    });
    const response = await send(await mountedRouter(authz));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { unrestricted: false, types: ['database.collection'] },
    });
  });

  it('refuses without the settings permission', async () => {
    const router = await mountedRouter(
      await authorization({ settings: false }),
    );

    const response = await router.request('/api/authz/inspect', inspect());

    expect(response.status).toBe(403);
  });

  it('returns the effect, the reasons and their plugin, untouched', async () => {
    const router = await mountedRouter(await authorization({ settings: true }));

    const [permitted, denied, conditional] = await Promise.all(
      ['permitted', 'denied', 'conditional'].map(async (id) => {
        const response = await router.request(
          '/api/authz/inspect',
          inspect(id),
        );
        expect(response.status).toBe(200);
        return ((await response.json()) as { data: AuthorizationDecision })
          .data;
      }),
    );

    expect(permitted).toEqual({
      effect: 'permit',
      reasons: [
        {
          code: 'GRANTED',
          message: 'A permission set grants it',
          plugin: 'test-decisions',
        },
      ],
    });
    expect(denied).toMatchObject({
      effect: 'deny',
      // A reason the core itself gave carries no plugin, and is passed on so.
      reasons: [{ code: 'NO_GRANT', message: 'Nothing grants it' }],
    });
    expect(denied.reasons[0]).not.toHaveProperty('plugin');
    expect(conditional).toMatchObject({
      effect: 'conditional',
      conditions: { type: 'filter', field: 'ownerId' },
    });
  });

  it('refuses a body that names no subject, resource or action', async () => {
    const router = await mountedRouter(await authorization({ settings: true }));

    const responses = await Promise.all(
      [
        {},
        { subject: { type: 'user', id: 'alice' }, action: 'read' },
        {
          subject: { type: 'user', id: 'alice' },
          resource: { type: 'test.resource', id: 'permitted' },
          action: '',
        },
      ].map((body) =>
        router.request('/api/authz/inspect', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      ),
    );

    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400]);
  });

  it('inspects the named person rather than the caller', async () => {
    const authz = await authorization({ settings: true });
    const router = await mountedRouter(authz);

    const response = await router.request('/api/authz/inspect', inspect());
    const { data } = (await response.json()) as {
      data: AuthorizationDecision & { subject?: unknown };
    };

    // 'admin' is the caller; the decision is about 'alice', who holds nothing.
    expect(data.effect).toBe('permit');
  });
});

function inspect(id: string = 'permitted'): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      subject: { type: 'user', id: 'alice' },
      resource: { type: 'test.resource', id },
      action: 'read',
    }),
  };
}

/** The caller is 'admin', holding the settings grants or holding nothing. */
async function authorization({
  settings,
}: {
  settings: boolean;
}): Promise<Authorization> {
  const identity: AuthorizationPlugin = {
    id: 'test-identity',
    setup(authz) {
      authz.use(async (request, next) => {
        request.principal = { type: 'user', id: 'admin' };
        await next();
      });
    },
  };
  const authz = createAuthorization({
    plugins: [
      identity,
      decisions,
      permissionSets({ store: new MockPermissionSetStore() }),
    ],
  }) as unknown as Authorization;
  await authz.permissionSets.create({
    key: 'root',
    grants: settings
      ? [
          {
            resource: { type: 'settings', id: '*' },
            actions: [{ action: 'read' }],
          },
        ]
      : [],
  });
  await authz.permissionSets.assign({
    permissionSet: 'root',
    subject: { type: 'user', id: 'admin' },
  });
  return authz;
}

async function mountedRouter(authorization: Authorization): Promise<Hono> {
  const container = new ServiceContainer();
  container.instance(authenticationToken, {
    required: () => async (_context, next) => next(),
  } as unknown as Auth);
  container.instance(authorizationToken, authorization);
  const routes = await apiRoutes.createRouter({
    appName: 'main',
    publicBasePath: '',
    config: { app: { name: 'main', publicBasePath: '' } },
    paths: createConfigPaths({ rootDir: '/missing' }),
    router: new Hono(),
    container,
  });
  return new Hono().route('/api', routes);
}
