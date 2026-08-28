import { Hono } from 'hono';

import type { FileUploads } from '../../services/index.js';

export interface UploadRoutesOptions {
  publicFileStorage: FileUploads;
}

export function createUploadRoutes(options: UploadRoutesOptions): Hono {
  const routes = new Hono();

  routes.post('/', async (c) => {
    const body = await c.req.parseBody();

    return c.json(await options.publicFileStorage.upload(body.file));
  });

  return routes;
}
