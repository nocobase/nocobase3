import type { Hono } from 'hono';

export function createAIRouter(app: Hono): void {
  app.get('/ai:listAllEnabledModels', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.modelService.listEnabled(ctx);
    return context.json(result as never);
  });

  app.get('/ai:listLLMProviders', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.modelService.listLLMProviders(ctx);
    return context.json(result as never);
  });

  app.get('/ai:listLLMServices', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.modelService.listLLMServices(
      ctx,
      context.req.query('model') || undefined,
    );
    return context.json(result as never);
  });

  app.get('/ai:listModels', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.modelService.listModels(
      ctx,
      context.req.query('llmService') ?? '',
      context.req.query('model') || undefined,
    );
    return context.json(result as never);
  });

  app.get('/ai:listProviderModels', async (context) => {
    const result = unsupportedAIAction('ai:listProviderModels');
    return context.json(result as never);
  });

  app.post('/ai:testFlight', async (context) => {
    const result = unsupportedAIAction('ai:testFlight');
    return context.json(result as never);
  });
}

function unsupportedAIAction(action: string): never {
  throw new Error(`Unsupported AI action: ${action}`);
}
