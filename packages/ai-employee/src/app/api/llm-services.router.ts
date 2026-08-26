import type { Hono } from 'hono';
import {
  aiActionPath,
  createAIActionHandler,
  objectBody,
  requiredString,
} from './router-utils.js';

export function createLLMServicesRouter(app: Hono, apiBasePath: string): void {
  app.all(
    aiActionPath(apiBasePath, 'llmServices:list'),
    createAIActionHandler('llmServices:list', ({ actor, ctx }) =>
      ctx.llmService.list(ctx, actor),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'llmServices:get'),
    createAIActionHandler('llmServices:get', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      const input = values.values ?? body;
      const key = requiredString(
        url.searchParams.get('filterByTk') ??
          values.filterByTk ??
          objectBody(input).name,
        'resource key',
      );
      return ctx.llmService.get(ctx, actor, key);
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'llmServices:create'),
    createAIActionHandler('llmServices:create', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      return ctx.llmService.upsert(
        ctx,
        actor,
        values.values ?? body,
        url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
      );
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'llmServices:update'),
    createAIActionHandler('llmServices:update', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      return ctx.llmService.upsert(
        ctx,
        actor,
        values.values ?? body,
        url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
      );
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'llmServices:destroy'),
    createAIActionHandler(
      'llmServices:destroy',
      async ({ actor, body, ctx, url }) => {
        const values = objectBody(body);
        const input = values.values ?? body;
        const key = requiredString(
          url.searchParams.get('filterByTk') ??
            values.filterByTk ??
            objectBody(input).name,
          'resource key',
        );
        await ctx.llmService.delete(ctx, actor, key);
        return null;
      },
    ),
  );
}
