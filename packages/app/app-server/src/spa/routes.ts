import type { Hono } from 'hono';
import path from 'node:path';

import { joinBasePath, normalizeBasePath } from '../support/paths.js';
import { injectSpaRuntimeHtml } from './runtime-globals.js';
import { serveSpaIndex } from './serve-index.js';
import { serveSpaAsset } from './static-assets.js';
import type { RegisterSpaRoutesOptions } from './types.js';

export function registerSpaRoutes(
  router: Hono,
  options: RegisterSpaRoutesOptions,
): void {
  const basePath = normalizeBasePath(options.basePath);
  const handler = options.handler;

  if (handler) {
    router.all(basePath || '/', (context) =>
      serveSpaHandler(context.req.raw, options),
    );
    router.all(`${basePath}/*`, (context) =>
      serveSpaHandler(context.req.raw, options),
    );
    return;
  }

  const rootDir = path.dirname(options.indexPath);
  const assetsRoutePath = joinBasePath(
    basePath,
    options.assetsPath ?? '/assets',
  );

  router.all(assetsRoutePath, (context) =>
    serveSpaAsset(context.req.raw, {
      rootDir,
      basePath,
    }),
  );
  router.all(`${assetsRoutePath}/*`, (context) =>
    serveSpaAsset(context.req.raw, {
      rootDir,
      basePath,
    }),
  );
  router.get(basePath || '/', () =>
    serveSpaIndex(
      options.indexPath,
      options.runtimeGlobals,
      options.clientConfig,
    ),
  );
  router.get(`${basePath}/*`, () =>
    serveSpaIndex(
      options.indexPath,
      options.runtimeGlobals,
      options.clientConfig,
    ),
  );
}

async function serveSpaHandler(
  request: Request,
  options: RegisterSpaRoutesOptions,
): Promise<Response> {
  const response = await options.handler?.(request);
  if (!response) {
    throw new Error('SPA handler is not configured.');
  }
  const contentType = response.headers.get('content-type')?.toLowerCase();
  if (!contentType?.includes('text/html')) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control', 'no-cache');
  return new Response(
    injectSpaRuntimeHtml(await response.text(), {
      clientConfig: options.clientConfig,
      runtimeGlobals: options.runtimeGlobals,
    }),
    { headers, status: response.status, statusText: response.statusText },
  );
}
