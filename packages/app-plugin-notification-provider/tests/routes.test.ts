import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';

describe('client routes', () => {
  it('defines a lazy notification provider demo route', async () => {
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
