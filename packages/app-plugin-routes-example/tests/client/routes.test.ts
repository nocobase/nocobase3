import { describe, expect, it } from 'vitest';

import routes from '../../client/routes.js';

describe('client routes', () => {
  it('defines a lazy authenticated route', () => {
    const [route] = routes.routes;

    expect(routes.parent).toBe('app');
    expect(routes.routes).toHaveLength(1);
    expect(route).toMatchObject({
      name: 'index',
      path: '/routes-example',
      componentLoader: expect.any(Function),
    });
  });
});
