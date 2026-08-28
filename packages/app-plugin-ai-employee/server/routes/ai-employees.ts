import type { Hono } from 'hono';
import type {
  AIEmployeeResourceInput,
  AIUserPromptUpdateInput,
} from './contracts.js';
import { requiredString } from './utils.js';

export function createAIEmployeeRouter(app: Hono): void {
  app.get('/aiEmployees:listByUser', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.employeeService.listByUser(ctx);
    return context.json(result as never);
  });

  app.post('/aiEmployees:updateUserPrompt', async (context) => {
    const ctx = context.var.ctx;
    const input = await context.req.json<AIUserPromptUpdateInput>();
    await ctx.employeeService.updateUserPrompt(
      ctx,
      requiredString(input.aiEmployee, 'aiEmployee'),
      typeof input.prompt === 'string' ? input.prompt : '',
    );
    const result = null;
    return context.json(result as never);
  });

  app.get('/aiEmployees:getTemplates', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.employeeService.getTemplates(ctx);
    return context.json(result as never);
  });

  app.get('/aiEmployees:list', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.employeeService.list(ctx);
    return context.json(result as never);
  });

  app.get('/aiEmployees:get', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.employeeService.get(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });

  app.post('/aiEmployees:create', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.employeeService.upsert(
      ctx,
      await context.req.json<AIEmployeeResourceInput>(),
    );
    return context.json(result as never);
  });

  app.put('/aiEmployees:update', async (context) => {
    const ctx = context.var.ctx;
    const input = await context.req.json<AIEmployeeResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const result = await ctx.employeeService.upsert(ctx, {
      ...input,
      username: key,
    });
    return context.json(result as never);
  });

  app.delete('/aiEmployees:destroy', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.employeeService.delete(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });
}
