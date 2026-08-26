import type { Hono } from 'hono';
import {
  aiActionPath,
  createAIActionHandler,
  requiredString,
} from './router-utils.js';

export function createAIFilesRouter(app: Hono, apiBasePath: string): void {
  app.all(
    aiActionPath(apiBasePath, 'aiFiles:create'),
    createAIActionHandler('aiFiles:create', ({ body, ctx }) => {
      if (!(body instanceof FormData))
        throw new Error('multipart/form-data body is required');
      const file = body.get('file');
      if (!(file instanceof File)) throw new Error('file is required');
      return ctx.fileService.create(ctx, file);
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiFiles:preview'),
    createAIActionHandler('aiFiles:preview', ({ ctx, url }) =>
      ctx.fileService.preview(
        ctx,
        requiredString(
          url.searchParams.get('filterByTk') ?? url.searchParams.get('id'),
          'file id',
        ),
      ),
    ),
  );
}
