import { describe, expect, it } from 'vitest';

import reactProviders from '../client/react-providers.js';
import routes from '../client/routes.js';
import { resolveInstalledDestination } from '../client/pages/install-navigation.js';

describe('@nocobase/app-plugin-install client', () => {
  it('contributes the installation route', async () => {
    expect(routes.parent).toBe('app');
    expect(routes.routes).toMatchObject([
      { auth: 'guest', name: 'install', path: '/install' },
    ]);
    await expect(routes.routes[0]?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    expect(reactProviders).toEqual([]);
  });

  it('redirects completed installation to home and later visits to login', () => {
    expect(resolveInstalledDestination(true)).toBe('/');
    expect(resolveInstalledDestination(false)).toBe('/login');
  });
});
