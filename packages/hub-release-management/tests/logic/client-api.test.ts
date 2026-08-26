import { afterEach, describe, expect, it, vi } from 'vitest';

import { createManagedApp, fetchReleaseOverview } from '../../client/api.ts';
import { resolvePortalBase } from '../../client/portal-base.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('release management client API', () => {
  it('falls back to the Vite base when dev HTML has no runtime base', () => {
    expect(resolvePortalBase(undefined, '/hub/')).toBe('/hub');
  });

  it('prefers the injected runtime base when requesting an overview', async () => {
    vi.stubGlobal('window', { NOCOBASE_PORTAL_BASE: '/tenant/' });
    const fetchMock = vi.fn().mockResolvedValue(Response.json({}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchReleaseOverview();

    expect(fetchMock).toHaveBeenCalledWith(
      '/tenant/api/release-management/overview',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('creates a managed App through the Hub API instead of the release prefix', async () => {
    vi.stubGlobal('window', { NOCOBASE_PORTAL_BASE: '/hub/' });
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json(
        {
          app: { appId: 'crm', name: 'CRM', status: 'not-deployed' },
          deployToken: 'nb3_app_token',
        },
        { status: 201 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createManagedApp({ appId: 'crm', name: 'CRM' }),
    ).resolves.toMatchObject({ deployToken: 'nb3_app_token' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/hub/api/apps',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ appId: 'crm', name: 'CRM' }),
      }),
    );
  });
});
