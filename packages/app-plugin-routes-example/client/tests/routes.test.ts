import type { AppClientRouteDefinition } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import routes from '../routes.js';

describe('client routes', () => {
  it('defines a lazy authenticated route', () => {
    const route = routes[0] as AppClientRouteDefinition;

    expect(routes).toHaveLength(1);
    expect(route).toMatchObject({
      name: 'index',
      path: '/routes-example',
      componentLoader: expect.any(Function),
    });
  });
});
