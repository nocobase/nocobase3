import type { Hono } from 'hono';
import {
  aiActionPath,
  createAIActionHandler,
  objectBody,
  requiredString,
} from './router-utils.js';

export function createAIToolsRouter(app: Hono, apiBasePath: string): void {
  app.all(
    aiActionPath(apiBasePath, 'aiTools:list'),
    createAIActionHandler('aiTools:list', ({ actor, ctx }) =>
      ctx.toolService.list(ctx, actor),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiTools:get'),
    createAIActionHandler('aiTools:get', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      const input = values.values ?? body;
      const key = requiredString(
        url.searchParams.get('filterByTk') ??
          values.filterByTk ??
          objectBody(objectBody(input).definition).name ??
          objectBody(input).name,
        'resource key',
      );
      return ctx.toolService.get(ctx, actor, key);
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiTools:create'),
    createAIActionHandler('aiTools:create', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      return ctx.toolService.upsert(
        ctx,
        actor,
        values.values ?? body,
        url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
      );
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiTools:update'),
    createAIActionHandler('aiTools:update', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      return ctx.toolService.upsert(
        ctx,
        actor,
        values.values ?? body,
        url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
      );
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiTools:destroy'),
    createAIActionHandler(
      'aiTools:destroy',
      async ({ actor, body, ctx, url }) => {
        const values = objectBody(body);
        const input = values.values ?? body;
        const key = requiredString(
          url.searchParams.get('filterByTk') ??
            values.filterByTk ??
            objectBody(objectBody(input).definition).name ??
            objectBody(input).name,
          'resource key',
        );
        await ctx.toolService.delete(ctx, actor, key);
        return null;
      },
    ),
  );
}
