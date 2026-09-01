import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';

describe('@nocobase/app-plugin-hub', () => {
  it('declares the authenticated Hub page and lazy-loads it', async () => {
    expect(routes.parent).toBe('app');
    expect(routes.routes).toHaveLength(1);
    expect(routes.routes[0]).toMatchObject({
      name: 'hub',
      path: '/hub',
      auth: 'required',
    });
    await expect(routes.routes[0]?.componentLoader?.()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
