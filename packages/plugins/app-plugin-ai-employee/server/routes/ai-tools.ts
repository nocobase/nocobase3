import type { Hono } from 'hono';
import type { AIToolResourceInput } from './contracts.js';
import { requiredString } from './utils.js';

export function createAIToolsRouter(app: Hono): void {
  app.get('/aiTools:list', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.toolService.list(ctx);
    return context.json(result as never);
  });

  app.get('/aiTools:get', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.toolService.get(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });

  app.post('/aiTools:create', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.toolService.upsert(
      ctx,
      await context.req.json<AIToolResourceInput>(),
    );
    return context.json(result as never);
  });

  app.put('/aiTools:update', async (context) => {
    const ctx = context.var.ctx;
    const input = await context.req.json<AIToolResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const definition =
      input.definition &&
      typeof input.definition === 'object' &&
      !Array.isArray(input.definition)
        ? input.definition
        : {};
    const result = await ctx.toolService.upsert(ctx, {
      ...input,
      definition: { ...definition, name: key },
    });
    return context.json(result as never);
  });

  app.delete('/aiTools:destroy', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.toolService.delete(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });
}
