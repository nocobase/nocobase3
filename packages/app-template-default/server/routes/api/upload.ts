import { Hono } from 'hono';

import type { PublicFilesRepository } from '../../repositories/public-files.js';

export interface UploadRoutesOptions {
  publicFiles: PublicFilesRepository;
}

export function createUploadRoutes(options: UploadRoutesOptions): Hono {
  const routes = new Hono();

  routes.post('/', async (c) => {
    const body = await c.req.parseBody();

    return c.json(await options.publicFiles.upload(body.file));
  });

  return routes;
}
