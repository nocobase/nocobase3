import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
  injectSpaRuntimeHtml,
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
  it('injects runtime globals before the first module script', () => {
    const html =
      '<main></main><script type="module" src="/assets/index.js"></script>';
    const result = injectSpaRuntimeGlobals(html, {
      APP_BASE_PATH: '/main/test/',
      'api-url': '</script><script>alert(1)</script>',
      ignored: undefined,
    });

    expect(result).toContain('window.APP_BASE_PATH = "/main/test/";');
    expect(result).toContain(
      'window["api-url"] = "\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E";',
    );
    expect(result).not.toContain('window.ignored');
    expect(result.indexOf('window.APP_BASE_PATH')).toBeLessThan(
      result.indexOf('<script type="module"'),
    );
  });

  it('injects a safe versioned Client config data block', () => {
    const html = '<script type="module" src="/assets/index.js"></script>';
    const result = injectSpaRuntimeHtml(html, {
      clientConfig: {
        title: '</script><script>alert(1)</script>',
        separators: '\u2028\u2029',
      },
    });

    expect(result).toContain(
      '<script id="nocobase-runtime-config" type="application/json">',
    );
    expect(result).toContain('"version":1');
    expect(result).toContain('\\u003C/script\\u003E');
    expect(result).toContain('\\u2028\\u2029');
    expect(result.indexOf('nocobase-runtime-config')).toBeLessThan(
      result.indexOf('<script type="module"'),
    );
  });
});

describe('SPA routes', () => {
  it('serves assets before the SPA fallback', async () => {
    const root = createSpaFixture();
    const router = new Hono();
    registerSpaRoutes(router, {
      basePath: '/main/test',
      indexPath: path.join(root, 'index.html'),
      runtimeGlobals: {
        APP_BASE_PATH: '/main/test/',
      },
    });

    const response = await router.request(
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
    const router = new Hono();
    registerSpaRoutes(router, {
      basePath: '/main/test',
      indexPath: path.join(root, 'index.html'),
      runtimeGlobals: {
        APP_BASE_PATH: '/main/test/',
      },
      clientConfig: { app: { title: 'NocoBase' } },
    });

    const response = await router.request(
      'http://localhost/main/test/settings',
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('window.APP_BASE_PATH = "/main/test/";');
    expect(html).toContain(
      '{"version":1,"config":{"app":{"title":"NocoBase"}}}',
    );
    expect(html).toContain(
      '<script type="module" src="/main/test/assets/index.js"></script>',
    );
  });

  it('injects the same runtime payload into proxied development HTML only', async () => {
    const router = new Hono();
    registerSpaRoutes(router, {
      basePath: '/main/test',
      indexPath: '/unused/index.html',
      clientConfig: { feature: { enabled: true } },
      runtimeGlobals: { APP_BASE_PATH: '/main/test/' },
      handler: (request) =>
        new URL(request.url).pathname.endsWith('.js')
          ? new Response('export default true;', {
              headers: { 'content-type': 'text/javascript' },
            })
          : new Response(
              '<script type="module" src="/src/main.tsx"></script>',
              {
                headers: { 'content-type': 'text/html; charset=utf-8' },
              },
            ),
    });

    const htmlResponse = await router.request(
      'http://localhost/main/test/settings',
    );
    const assetResponse = await router.request(
      'http://localhost/main/test/src/main.js',
    );

    await expect(htmlResponse.text()).resolves.toContain(
      '{"version":1,"config":{"feature":{"enabled":true}}}',
    );
    await expect(assetResponse.text()).resolves.toBe('export default true;');
  });

  it('does not return the SPA index for missing assets', async () => {
    const root = createSpaFixture();
    const router = new Hono();
    registerSpaRoutes(router, {
      basePath: '/main/test',
      indexPath: path.join(root, 'index.html'),
    });

    const response = await router.request(
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
