import { describe, expect, it } from 'vitest';

import routes from '../client/routes.js';
import { Boxes } from 'lucide-react';
import plugin from '../client/plugin.js';

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

  it('declares its translated menu directly on the route without a menu provider', () => {
    expect(routes.routes[0]).toMatchObject({
      navigation: { title: 'navigation.applications', icon: Boxes },
    });
    expect(plugin.serviceProviders).toBeUndefined();
  });
});
