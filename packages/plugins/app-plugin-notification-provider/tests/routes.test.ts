import { describe, expect, it } from 'vitest';

import createRoutes from '../client/routes.js';

describe('client routes', () => {
  it('does not expose the demonstration route by default', () => {
    expect(createRoutes({})).toEqual([]);
  });

  it('defines a lazy notification provider demo route when explicitly enabled', async () => {
    const routes = createRoutes({ enableDemoRoute: true });
    if (Array.isArray(routes))
      throw new Error('Expected a route contribution.');
    const [route] = routes.routes;

    expect(routes.parent).toBe('app');
    expect(routes.routes).toHaveLength(1);
    expect(route).toMatchObject({
      componentLoader: expect.any(Function),
      name: 'demo',
      path: '/notification-provider',
    });
    await expect(route.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    expect(Object.isFrozen(routes)).toBe(true);
    expect(Object.isFrozen(routes.routes)).toBe(true);
  });
});
