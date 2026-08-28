import type { Hono } from 'hono';
import type { AISkillResourceInput } from './contracts.js';
import { requiredString } from './utils.js';

export function createAISkillsRouter(app: Hono): void {
  app.get('/aiSkills:list', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.skillService.list(ctx);
    return context.json(result as never);
  });

  app.get('/aiSkills:get', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.skillService.get(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });

  app.post('/aiSkills:create', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.skillService.upsert(
      ctx,
      await context.req.json<AISkillResourceInput>(),
    );
    return context.json(result as never);
  });

  app.put('/aiSkills:update', async (context) => {
    const ctx = context.var.ctx;
    const input = await context.req.json<AISkillResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const result = await ctx.skillService.upsert(ctx, {
      ...input,
      name: key,
    });
    return context.json(result as never);
  });

  app.delete('/aiSkills:destroy', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.skillService.delete(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });
}
