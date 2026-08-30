import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';

describe('@nocobase/app-plugin-system-info', () => {
  it('declares its client contributions', async () => {
    expect(routes).toMatchObject({
      parent: 'app',
      routes: [{ name: 'index', path: '/system-info' }],
    });

    await expect(routes.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
