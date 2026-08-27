import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchReleaseOverview, unregisterManagedApp } from '../client/api.ts';

describe('release management client API', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_URL', '/hub/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the Vite Portal base when the runtime global is unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        apps: [],
        deployments: [],
        lifecycleOperations: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchReleaseOverview();

    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/release-management/overview',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    );
  });

  it('unregisters an App through the Hub app management API', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ appId: 'demo', removed: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(unregisterManagedApp('demo')).resolves.toEqual({
      appId: 'demo',
      removed: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/apps/demo',
      expect.objectContaining({ credentials: 'include', method: 'DELETE' }),
    );
  });
});
