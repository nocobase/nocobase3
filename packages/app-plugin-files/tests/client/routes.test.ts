import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import routes from '../../client/routes.js';
import { FILES_ROUTE_IDS } from '../../client/route-contracts.js';

describe('files plugin client route', () => {
  it('contributes the frozen lazy demo Route', async () => {
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      name: 'demo',
      path: '/files-demo',
    });
    expect(Object.isFrozen(routes)).toBe(true);
    expect(Object.isFrozen(routes[0])).toBe(true);

    const [registered] = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-plugin-files',
        routes,
      },
    ]).routes;

    expect(registered).toMatchObject({
      id: FILES_ROUTE_IDS.demo,
      name: 'demo',
      path: '/files-demo',
      source: 'plugin',
    });
    await expect(routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
