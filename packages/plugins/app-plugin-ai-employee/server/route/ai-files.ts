import type { ServiceFactory } from '../factory/service-factory.js';
import type { Hono } from 'hono';

import { normalizeFilename } from '@nocobase/ai-employee';

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
      canReadAnyFile: context.var.canAccessAISettings,
    });
    return new Response(result.stream, {
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': inlineContentDisposition(result.filename),
      },
    });
  });
}

/**
 * `filename` is a quoted ASCII fallback for clients that read nothing else;
 * `filename*` carries the real name, in any script, as RFC 6266 describes.
 */
function inlineContentDisposition(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${normalizeFilename(filename)}"; filename*=UTF-8''${encoded}`;
}
