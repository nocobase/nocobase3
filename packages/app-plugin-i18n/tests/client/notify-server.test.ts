import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * An application is served from a base path, and its API lives under that base rather than at the origin root.
 *
 * This is the regression the test exists for: a hard-coded `/api/i18n/locale` reaches the origin root and 404s on
 * every application the template generates, since those are served from `/main` by default.
 */
const BASE = '/main';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('telling the server which language to answer in', () => {
  it('requests the endpoint under the application base path', async () => {
    const fetchSpy = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('window', {
      location: { origin: 'http://localhost:13000' },
      NOCOBASE_PORTAL_BASE: BASE,
    });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
    });

    // Imported after the globals are in place, because the client resolves the base when it is first created.
    const { notifyServerLocale } = await import('../../client/use-locale.js');
    await notifyServerLocale('zh-CN');

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    // Path-relative, which the browser resolves against the current origin.
    expect(String(url)).toBe(`${BASE}/api/i18n/locale`);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ locale: 'zh-CN' }));
  });
});
