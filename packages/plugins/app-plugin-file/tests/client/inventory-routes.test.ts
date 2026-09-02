import { describe, expect, it } from 'vitest';

import routes from '../../client/routes.js';

describe('file inventory client routes', () => {
  it('declares a protected Settings page', () => {
    expect(routes).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'files',
          path: '/files',
          navigation: { title: 'inventory.nav' },
        },
      ],
    });
    const route = routes.routes[0];
    expect(route && 'componentLoader' in route).toBe(true);
  });
});
