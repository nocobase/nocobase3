import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import routes from '../../client/routes.js';
import { FILE_ROUTE_IDS } from '../../client/route-contracts.js';

describe('file plugin client route', () => {
  it('contributes the frozen lazy demo Route', async () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      name: 'demo',
      path: '/file-demo',
    });
    expect(Object.isFrozen(routes)).toBe(true);
    expect(Object.isFrozen(routes[0])).toBe(true);

    const [registered] = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-file',
        routes,
      },
    ]).routes;

    expect(registered).toMatchObject({
      id: FILE_ROUTE_IDS.demo,
      name: 'demo',
      path: '/file-demo',
      source: 'plugin',
    });
    await expect(routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
