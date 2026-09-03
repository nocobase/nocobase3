import { describe, expect, it, vi } from 'vitest';

import routes from '../client/routes.js';
import { HubNavigationProvider } from '../client/providers/hub-navigation.js';

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

  it('registers the Hub page in the application navigation', async () => {
    const addResources = vi.fn();
    const provider = new HubNavigationProvider({
      refine: { addResources },
    } as never);

    await provider.boot();

    expect(addResources).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'hub',
        list: '/hub',
        meta: expect.objectContaining({
          label: 'navigation.applications',
          i18nNs: '@nocobase/app-plugin-hub',
        }),
      }),
    ]);
  });
});
