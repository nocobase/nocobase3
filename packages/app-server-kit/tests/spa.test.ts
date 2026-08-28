import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createPortalSpaRuntimeGlobals,
  injectSpaRuntimeGlobals,
  registerSpaRoutes,
} from '../src/spa/index.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('SPA runtime globals', () => {
  it('creates the default Portal browser contract', () => {
    expect(
      createPortalSpaRuntimeGlobals({
        appBasePath: '/main/test///',
        apiUrl: '/main/test/v2/api',
      }),
    ).toEqual({
      NOCOBASE_PORTAL_BASE: '/main/test/',
      NOCOBASE_API_URL: '/main/test/v2/api',
      __nocobase_api_client_storage_prefix__: 'NOCOBASE_',
      __nocobase_api_client_storage_type__: 'localStorage',
      __nocobase_api_client_share_token__: false,
    });
  });

  it('preserves custom Portal storage settings', () => {
    expect(
      createPortalSpaRuntimeGlobals({
        appBasePath: '',
        apiUrl: '/v2/api',
        storagePrefix: ' CRM_ ',
        storageType: ' sessionStorage ',
        shareToken: true,
      }),
    ).toEqual({
      NOCOBASE_PORTAL_BASE: '/',
      NOCOBASE_API_URL: '/v2/api',
      __nocobase_api_client_storage_prefix__: 'CRM_',
      __nocobase_api_client_storage_type__: 'sessionStorage',
      __nocobase_api_client_share_token__: true,
    });
  });

  it('injects runtime globals before the first module script', () => {
    const html =
      '<main></main><script type="module" src="/assets/index.js"></script>';
    const result = injectSpaRuntimeGlobals(html, {
      NOCOBASE_PORTAL_BASE: '/main/test/',
      'api-url': '</script><script>alert(1)</script>',
      ignored: undefined,
    });

    expect(result).toContain('window.NOCOBASE_PORTAL_BASE = "/main/test/";');
    expect(result).toContain(
      'window["api-url"] = "\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E";',
    );
    expect(result).not.toContain('window.ignored');
    expect(result.indexOf('window.NOCOBASE_PORTAL_BASE')).toBeLessThan(
      result.indexOf('<script type="module"'),
    );
  });
});

describe('SPA routes', () => {
  it('serves assets before the SPA fallback', async () => {
    const root = createSpaFixture();
    const app = new Hono();
    registerSpaRoutes(app, {
      basePath: '/main/test',
      indexPath: path.join(root, 'index.html'),
      runtimeGlobals: {
        NOCOBASE_PORTAL_BASE: '/main/test/',
      },
    });

    const response = await app.request(
      'http://localhost/main/test/assets/index.js',
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/javascript; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    await expect(response.text()).resolves.toBe('console.log("asset");');
  });

  it('returns the runtime-injected index for SPA routes', async () => {
    const root = createSpaFixture();
    const app = new Hono();
    registerSpaRoutes(app, {
      basePath: '/main/test',
      indexPath: path.join(root, 'index.html'),
      runtimeGlobals: {
        NOCOBASE_PORTAL_BASE: '/main/test/',
      },
    });

    const response = await app.request('http://localhost/main/test/settings');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('window.NOCOBASE_PORTAL_BASE = "/main/test/";');
    expect(html).toContain(
      '<script type="module" src="/main/test/assets/index.js"></script>',
    );
  });

  it('prefers the raw build index and mounts its assets at the runtime base', async () => {
    const root = createSpaFixture();
    writeFileSync(
      rootPath(root, 'index.raw.html'),
      [
        '<link rel="icon" href="/assets/favicon.ico">',
        '<meta property="og:image" content="/assets/social.png">',
        '<script type="module" src="/assets/runtime.js"></script>',
      ].join(''),
    );
    const app = new Hono();
    registerSpaRoutes(app, {
      basePath: '/main/test',
      indexPath: path.join(root, 'index.html'),
      runtimeGlobals: {
        NOCOBASE_PORTAL_BASE: '/main/test/',
      },
    });

    const response = await app.request('http://localhost/main/test/settings');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('href="/main/test/assets/favicon.ico"');
    expect(html).toContain('content="/main/test/assets/social.png"');
    expect(html).toContain('src="/main/test/assets/runtime.js"');
    expect(html).not.toContain('src="/main/test/assets/index.js"');
    expect(html.indexOf('window.NOCOBASE_PORTAL_BASE')).toBeLessThan(
      html.indexOf('<script type="module"'),
    );
  });

  it('does not return the SPA index for missing assets', async () => {
    const root = createSpaFixture();
    const app = new Hono();
    registerSpaRoutes(app, {
      basePath: '/main/test',
      indexPath: path.join(root, 'index.html'),
    });

    const response = await app.request(
      'http://localhost/main/test/assets/missing.js',
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Not found',
    });
  });
});

function createSpaFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nocobase-app-server-spa-'));
  tempDirs.push(root);
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(
    rootPath(root, 'index.html'),
    '<script type="module" src="/main/test/assets/index.js"></script>',
  );
  writeFileSync(rootPath(root, 'assets/index.js'), 'console.log("asset");');
  return root;
}

function rootPath(root: string, pathInsideRoot: string): string {
  return path.join(root, pathInsideRoot);
}
