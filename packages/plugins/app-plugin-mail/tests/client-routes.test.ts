import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';

describe('Mail client routes', () => {
  it('contributes only the lazy development route', async () => {
    expect(routes).toHaveLength(1);
    expect(routes.some((contribution) => contribution.parent === 'app')).toBe(
      false,
    );
    expect(
      routes.some((contribution) => contribution.parent === 'settings'),
    ).toBe(false);
    const [dev] = routes;
    expect(dev).toMatchObject({
      parent: 'dev',
      routes: [
        {
          name: 'mail',
          path: '/mail',
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: expect.any(Function),
        },
      ],
    });

    if (dev?.parent !== 'dev') {
      throw new Error('Missing Mail client route contribution.');
    }
    await expect(dev.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
