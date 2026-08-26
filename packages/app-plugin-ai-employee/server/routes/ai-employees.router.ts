import type { Hono } from 'hono';
import {
  aiActionPath,
  createAIActionHandler,
  objectBody,
  requiredString,
} from './router-utils.js';

export function createAIEmployeeRouter(app: Hono, apiBasePath: string): void {
  app.all(
    aiActionPath(apiBasePath, 'aiEmployees:listByUser'),
    createAIActionHandler('aiEmployees:listByUser', ({ ctx }) =>
      ctx.employeeService.listByUser(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiEmployees:updateUserPrompt'),
    createAIActionHandler(
      'aiEmployees:updateUserPrompt',
      async ({ body, ctx }) => {
        const values = objectBody(body);
        await ctx.employeeService.updateUserPrompt(
          ctx,
          requiredString(values.aiEmployee, 'aiEmployee'),
          typeof values.prompt === 'string' ? values.prompt : '',
        );
        return null;
      },
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiEmployees:getTemplates'),
    createAIActionHandler('aiEmployees:getTemplates', ({ ctx }) =>
      ctx.employeeService.getTemplates(ctx),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiEmployees:list'),
    createAIActionHandler('aiEmployees:list', ({ actor, ctx }) =>
      ctx.employeeService.list(ctx, actor),
    ),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiEmployees:get'),
    createAIActionHandler('aiEmployees:get', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      const input = values.values ?? body;
      const key = requiredString(
        url.searchParams.get('filterByTk') ??
          values.filterByTk ??
          objectBody(input).username,
        'resource key',
      );
      return ctx.employeeService.get(ctx, actor, key);
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiEmployees:create'),
    createAIActionHandler('aiEmployees:create', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      return ctx.employeeService.upsert(
        ctx,
        actor,
        values.values ?? body,
        url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
      );
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiEmployees:update'),
    createAIActionHandler('aiEmployees:update', ({ actor, body, ctx, url }) => {
      const values = objectBody(body);
      return ctx.employeeService.upsert(
        ctx,
        actor,
        values.values ?? body,
        url.searchParams.get('filterByTk') ?? values.filterByTk ?? undefined,
      );
    }),
  );

  app.all(
    aiActionPath(apiBasePath, 'aiEmployees:destroy'),
    createAIActionHandler(
      'aiEmployees:destroy',
      async ({ actor, body, ctx, url }) => {
        const values = objectBody(body);
        const input = values.values ?? body;
        const key = requiredString(
          url.searchParams.get('filterByTk') ??
            values.filterByTk ??
            objectBody(input).username,
          'resource key',
        );
        await ctx.employeeService.delete(ctx, actor, key);
        return null;
      },
    ),
  );
}
