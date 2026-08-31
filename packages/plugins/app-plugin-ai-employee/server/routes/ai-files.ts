import type { Hono } from 'hono';
import { requiredString } from './utils.js';

export function createAIFilesRouter(app: Hono): void {
  app.post('/aiFiles:create', async (context) => {
    const ctx = context.var.ctx;
    const form = await context.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new Error('file is required');
    const result = await ctx.fileService.create(ctx, file);
    return context.json(result as never);
  });

  app.get('/aiFiles:preview', async (context) => {
    const ctx = context.var.ctx;
    return ctx.fileService.preview(
      ctx,
      requiredString(context.req.query('id'), 'file id'),
    );
  });
}
