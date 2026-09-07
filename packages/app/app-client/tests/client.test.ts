import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveAppBase } from '../src/client.js';

/**
 * What the bundler compiled into the module under test. Vite inlines `import.meta.env.BASE_URL` at transform time, so
 * a test cannot stub it; reading the same constant here is how the fallback branch gets an expected value.
 */
const bundlerBase = import.meta.env.BASE_URL;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveAppBase', () => {
  it('reads the base path the server injected at runtime', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: '/main/' });

    expect(resolveAppBase()).toBe('/main/');
    // Injected at runtime, so it has to win over whatever the bundler knew at build time.
    expect(resolveAppBase()).not.toBe(bundlerBase);
  });

  it('normalizes a runtime base path missing its slashes', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: 'main' });

    expect(resolveAppBase()).toBe('/main/');
  });

  it('normalizes a nested base path with repeated slashes', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: '///apps/demo//' });

    expect(resolveAppBase()).toBe('/apps/demo/');
  });

  it("falls back to the bundler's base when nothing was injected", () => {
    // The development server, which serves the client without injecting the runtime global.
    vi.stubGlobal('window', {});

    expect(resolveAppBase()).toBe(bundlerBase);
  });

  it('ignores a runtime base that is not a string', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: 42 });

    expect(resolveAppBase()).toBe(bundlerBase);
  });

  it('serves from the origin root when the runtime base is a single slash', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: '/' });

    expect(resolveAppBase()).toBe('/');
  });

  it('serves from the origin root when the runtime base is empty', () => {
    vi.stubGlobal('window', { APP_BASE_PATH: '' });

    expect(resolveAppBase()).toBe('/');
  });

  it('serves from the origin root outside a browser', () => {
    vi.stubGlobal('window', undefined);

    expect(resolveAppBase()).toBe('/');
  });
});
