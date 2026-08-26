import type { AppClientRouteDefinition } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import { FILES_ROUTE_IDS } from '../client/route-contracts.js';
import routes from '../client/routes.js';

describe('Files client routes', () => {
  it('defines the stable lazy Files index route', async () => {
    const route = routes[0] as AppClientRouteDefinition;

    expect(routes).toHaveLength(1);
    expect(route).toMatchObject({
      name: 'index',
      path: '/files',
      componentLoader: expect.any(Function),
    });
    expect(FILES_ROUTE_IDS.index).toBe('@nocobase/app-plugin-files:index');
    await expect(route.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    expect(Object.isFrozen(routes)).toBe(true);
  });
});
