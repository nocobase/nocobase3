import type { AppClientRouteRegistration } from '@nocobase/app-client/plugins';
import { describe, expect, it, vi } from 'vitest';

import bootstrap from '../bootstrap.js';

describe('client bootstrap', () => {
  it('registers a lazy authenticated route', async () => {
    const add = vi.fn<(route: AppClientRouteRegistration) => void>();

    await bootstrap({
      appClient: { request: vi.fn() },
      packageName: '@nocobase/app-plugin-routes-example',
      refine: { setAuthProvider: vi.fn() },
      routes: { add },
    });

    expect(add).toHaveBeenCalledExactlyOnceWith({
      name: 'index',
      path: '/routes-example',
      componentLoader: expect.any(Function),
    });
  });
});
