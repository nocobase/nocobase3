import type { Hono } from 'hono';
import {
  aiActionPath,
  createAIActionHandler,
  objectBody,
  requiredString,
} from './router-utils.js';

export function createAIMCPServersRouter(app: Hono, apiBasePath: string): void {
  app.all(
    aiActionPath(apiBasePath, 'aiMcpServers:list'),
    createAIActionHandler('aiMcpServers:list', ({ actor, ctx }) =>
      ctx.mcpServerService.list(ctx, actor),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiMcpServers:get'),
    createAIActionHandler('aiMcpServers:get', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      const input = values.values ?? body;
      const key = requiredString(
        url.searchParams.get('filterByTk') ??
          values.filterByTk ??
          objectBody(input).name,
        'resource key',
      );
      return ctx.mcpServerService.get(ctx, actor, key);
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiMcpServers:create'),
    createAIActionHandler(
      'aiMcpServers:create',
      ({ actor, body, ctx, url }) => {
        const values = objectBody(body);
        return ctx.mcpServerService.upsert(
          ctx,
          actor,
          values.values ?? body,
          url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
        );
      },
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiMcpServers:update'),
    createAIActionHandler(
      'aiMcpServers:update',
      ({ actor, body, ctx, url }) => {
        const values = objectBody(body);
        return ctx.mcpServerService.upsert(
          ctx,
          actor,
          values.values ?? body,
          url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
        );
      },
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiMcpServers:destroy'),
    createAIActionHandler(
      'aiMcpServers:destroy',
      async ({ actor, body, ctx, url }) => {
        const values = objectBody(body);
        const input = values.values ?? body;
        const key = requiredString(
          url.searchParams.get('filterByTk') ??
            values.filterByTk ??
            objectBody(input).name,
          'resource key',
        );
        await ctx.mcpServerService.delete(ctx, actor, key);
        return null;
      },
    ),
  );
}
