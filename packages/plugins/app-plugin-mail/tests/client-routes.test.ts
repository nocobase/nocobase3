import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';

describe('Mail client routes', () => {
  it('contributes lazy workspace, Settings, and development routes', async () => {
    const [workspace, settings, dev] = routes;

    expect(workspace).toMatchObject({
      parent: 'app',
      routes: [
        {
          name: 'mail',
          path: '/mail',
          auth: 'required',
          access: { resource: 'mail', action: 'access' },
          componentLoader: expect.any(Function),
        },
      ],
    });

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

    if (
      workspace?.parent !== 'app' ||
      settings?.parent !== 'settings' ||
      dev?.parent !== 'dev'
    ) {
      throw new Error('Missing Mail client route contribution.');
    }
    await expect(workspace.routes[0]?.componentLoader()).resolves.toMatchObject(
      { default: expect.any(Function) },
    );
    await expect(settings.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    await expect(dev.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
