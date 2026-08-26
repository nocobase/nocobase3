import type { AppClientRouteDefinition } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import { REGISTRY_EXAMPLE_ROUTE_IDS } from '../client/route-contracts.js';
import routes from '../client/routes.js';

describe('Registry example client routes', () => {
  it('defines the stable lazy route used by the Registry override', () => {
    const route = routes[0] as AppClientRouteDefinition;

    expect(routes).toHaveLength(1);
    expect(route).toMatchObject({
      name: 'index',
      path: '/registry-example',
      componentLoader: expect.any(Function),
    });
    expect(REGISTRY_EXAMPLE_ROUTE_IDS.index).toBe(
      '@nocobase/app-plugin-registry-example:index',
    );
  });
});
