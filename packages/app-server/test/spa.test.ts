import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';

import {
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
    const html = '<main></main><script type="module" src="/assets/index.js"></script>';
    const result = injectSpaRuntimeGlobals(html, {
      NOCOBASE_PORTAL_BASE: '/main/test/',
      'api-url': '</script><script>alert(1)</script>',
      ignored: undefined,
    });

    expect(result).toContain('window.NOCOBASE_PORTAL_BASE = "/main/test/";');
    expect(result).toContain('window["api-url"] = "\\u003C/script\\u003E\\u003Cscript\\u003Ealert(1)\\u003C/script\\u003E";');
    expect(result).not.toContain('window.ignored');
    expect(result.indexOf('window.NOCOBASE_PORTAL_BASE')).toBeLessThan(result.indexOf('<script type="module"'));
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

    const response = await app.request('http://localhost/main/test/assets/index.js');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
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
    expect(html).toContain('<script type="module" src="/main/test/assets/index.js"></script>');
  });

  it('does not return the SPA index for missing assets', async () => {
    const root = createSpaFixture();
    const app = new Hono();
    registerSpaRoutes(app, {
      basePath: '/main/test',
      indexPath: path.join(root, 'index.html'),
    });

    const response = await app.request('http://localhost/main/test/assets/missing.js');

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
  writeFileSync(rootPath(root, 'index.html'), '<script type="module" src="/main/test/assets/index.js"></script>');
  writeFileSync(rootPath(root, 'assets/index.js'), 'console.log("asset");');
  return root;
}

function rootPath(root: string, pathInsideRoot: string): string {
  return path.join(root, pathInsideRoot);
}
