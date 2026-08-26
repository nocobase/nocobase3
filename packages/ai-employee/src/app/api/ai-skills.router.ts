import type { Hono } from 'hono';
import {
  aiActionPath,
  createAIActionHandler,
  objectBody,
  requiredString,
} from './router-utils.js';

export function createAISkillsRouter(app: Hono, apiBasePath: string): void {
  app.all(
    aiActionPath(apiBasePath, 'aiSkills:list'),
    createAIActionHandler('aiSkills:list', ({ actor, ctx }) =>
      ctx.skillService.list(ctx, actor),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiSkills:get'),
    createAIActionHandler('aiSkills:get', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      const input = values.values ?? body;
      const key = requiredString(
        url.searchParams.get('filterByTk') ??
          values.filterByTk ??
          objectBody(input).name,
        'resource key',
      );
      return ctx.skillService.get(ctx, actor, key);
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiSkills:create'),
    createAIActionHandler('aiSkills:create', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      return ctx.skillService.upsert(
        ctx,
        actor,
        values.values ?? body,
        url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
      );
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiSkills:update'),
    createAIActionHandler('aiSkills:update', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      return ctx.skillService.upsert(
        ctx,
        actor,
        values.values ?? body,
        url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
      );
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiSkills:destroy'),
    createAIActionHandler(
      'aiSkills:destroy',
      async ({ actor, body, ctx, url }) => {
        const values = objectBody(body);
        const input = values.values ?? body;
        const key = requiredString(
          url.searchParams.get('filterByTk') ??
            values.filterByTk ??
            objectBody(input).name,
          'resource key',
        );
        await ctx.skillService.delete(ctx, actor, key);
        return null;
      },
    ),
  );
}
