import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import providers from '../client/providers.js';
import routes from '../client/routes.js';

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('declares its client contributions', async () => {
    expect(bootstrap).toBeTypeOf('function');
    expect(routes).toMatchObject([
      {
        parent: 'app',
        routes: [{ name: 'index', path: __NOCOBASE_ROUTE_PATH_LITERAL__ }],
      },
      {
        parent: 'settings',
        routes: [
          {
            name: __NOCOBASE_SHORT_NAME_LITERAL__,
            path: __NOCOBASE_ROUTE_PATH_LITERAL__,
          },
        ],
      },
    ]);
    expect(providers).toMatchObject([
      {
        name: __NOCOBASE_SHORT_NAME_LITERAL__,
        component: expect.any(Function),
      },
    ]);

    await expect(routes[0]?.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    const setting = routes[1]?.routes[0];
    if (!setting || 'children' in setting) {
      throw new Error('Expected a single settings page.');
    }
    await expect(setting.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
