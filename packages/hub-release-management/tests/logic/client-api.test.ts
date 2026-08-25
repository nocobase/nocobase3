import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchReleaseOverview } from '../../client/api.ts';
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
});
