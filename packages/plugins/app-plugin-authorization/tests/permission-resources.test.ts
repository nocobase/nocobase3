import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';

import { createAuthorizationRoutes } from '../server/routes/authorization.js';
import { PermissionResourceRegistry } from '../server/permission-resources.js';
import type { AppAuthorization } from '../server/authorization.js';

describe('PermissionResourceRegistry', () => {
  it('collects resource types contributed by application plugins', () => {
    const registry = new PermissionResourceRegistry();
    const contribution = {
      plugin: 'notification',
      resourceType: {
        value: 'notification',
        label: 'Notifications',
        resources: [
          {
            value: 'test',
            label: 'Test notifications',
            actions: [{ value: 'send', label: 'Send' }],
          },
        ],
        actions: [{ value: 'send', label: 'Send' }],
      },
    } as const;

    registry.register(contribution);

    expect(registry.list()).toEqual([contribution]);
    expect(() => registry.register(contribution)).toThrow(
      'Permission resource type "notification" is already registered.',
    );
  });

  it('exposes contributed resources in permission-set options', async () => {
    const registry = new PermissionResourceRegistry();
    registry.register({
      plugin: 'notification',
      resourceType: {
        value: 'notification',
        label: 'Notifications',
        resources: [
          {
            value: 'test',
            label: 'Test notifications',
            actions: [{ value: 'send', label: 'Send' }],
          },
        ],
        actions: [{ value: 'send', label: 'Send' }],
      },
    });
    const authorization = {
      middleware: () => async (context: object, next: () => Promise<void>) => {
        (context as { set(name: string, value: object): void }).set('authz', {
          require: () => Promise.resolve(),
        });
        await next();
      },
      permissionResources: registry,
      database: {
        collections: { list: () => [] },
        recordAccess: { list: () => [] },
      },
      administration: {},
    } as unknown as AppAuthorization;
    const auth = {
      required: () => async (_context: object, next: () => Promise<void>) =>
        next(),
    };
    const router = new Hono();
    router.route('/', createAuthorizationRoutes(auth as never, authorization));

    const response = await router.request('/permission-sets/options');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        resourceTypes: [
          expect.objectContaining({ value: 'page' }),
          expect.objectContaining({ value: 'notification' }),
        ],
      },
    });
  });
});
