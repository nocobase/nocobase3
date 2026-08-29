import { describe, expect, it } from 'vitest';

import bootstrap from '../client/bootstrap.js';
import providers from '../client/providers.js';
import routes from '../client/routes.js';

describe('@nocobase/app-plugin-audit-log', () => {
  it('declares its client contributions', async () => {
    expect(bootstrap).toBeTypeOf('function');
    expect(routes).toMatchObject([
      { parent: 'app', routes: [{ name: 'index', path: '/audit-log' }] },
      {
        parent: 'settings',
        routes: [{ name: 'audit-log', path: '/audit-log' }],
      },
    ]);
    expect(providers).toMatchObject([
      {
        name: 'audit-log',
        component: expect.any(Function),
      },
    ]);

    await expect(
      routes[0]?.routes[0]?.componentLoader(),
    ).resolves.toMatchObject({
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
