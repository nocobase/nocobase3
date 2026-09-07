import type { ServiceFactory } from '../service/factory.js';
import type { Hono } from 'hono';

import { requiredString } from './utils.js';

export function createAIFilesRouter(app: Hono, services: ServiceFactory): void {
  app.post('/aiFiles:create', async (context) => {
    const form = await context.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('file is required');
    const result = await services.fileService.create({
      actor: context.var.currentUser,
      file,
    });
    return context.json(result as never);
  });

  app.get('/aiFiles:preview', async (context) => {
    const result = await services.fileService.preview({
      actor: context.var.currentUser,
      id: requiredString(context.req.query('id'), 'id'),
    });
    return new Response(result.stream, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(result.filename)}"`,
      },
    });
  });
}
