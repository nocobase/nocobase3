import type { Hono } from 'hono';
import path from 'node:path';

import { joinBasePath, normalizeBasePath } from '../support/paths.js';
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
    router.all(basePath || '/', (context) => handler(context.req.raw));
    router.all(`${basePath}/*`, (context) => handler(context.req.raw));
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
    serveSpaIndex(options.indexPath, options.runtimeGlobals),
  );
  router.get(`${basePath}/*`, () =>
    serveSpaIndex(options.indexPath, options.runtimeGlobals),
  );
}
