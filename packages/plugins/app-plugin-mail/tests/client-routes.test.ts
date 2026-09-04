import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';

describe('Mail client routes', () => {
  it('contributes lazy Settings and development routes', async () => {
    const [settings, dev] = routes;

    expect(settings).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'mail',
          path: '/mail',
          access: { resource: 'mail.settings', action: 'access' },
          componentLoader: expect.any(Function),
        },
      ],
    });
    expect(dev).toMatchObject({
      parent: 'dev',
      routes: [
        {
          name: 'mail',
          path: '/mail',
          componentLoader: expect.any(Function),
        },
      ],
    });

    if (settings?.parent !== 'settings' || dev?.parent !== 'dev') {
      throw new Error('Missing Mail client route contribution.');
    }
    await expect(settings.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    await expect(dev.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
