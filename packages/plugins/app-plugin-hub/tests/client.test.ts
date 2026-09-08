import { describe, expect, it, vi } from 'vitest';

import { HubNavigationProvider } from '../client/providers/hub-navigation.js';

describe('@nocobase/app-plugin-hub', () => {
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
