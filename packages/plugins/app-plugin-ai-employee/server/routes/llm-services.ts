import type { Hono } from 'hono';
import type { LLMServiceResourceInput } from './contracts.js';
import { requiredString } from './utils.js';

export function createLLMServicesRouter(app: Hono): void {
  app.get('/llmServices:list', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.llmService.list(ctx);
    return context.json(result as never);
  });

  app.get('/llmServices:get', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.llmService.get(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });

  app.post('/llmServices:create', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.llmService.upsert(
      ctx,
      await context.req.json<LLMServiceResourceInput>(),
    );
    return context.json(result as never);
  });

  app.put('/llmServices:update', async (context) => {
    const ctx = context.var.ctx;
    const input = await context.req.json<LLMServiceResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const result = await ctx.llmService.upsert(ctx, {
      ...input,
      name: key,
    });
    return context.json(result as never);
  });

  app.delete('/llmServices:destroy', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.llmService.delete(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });
}
