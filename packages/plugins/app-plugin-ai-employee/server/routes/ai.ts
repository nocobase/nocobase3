import type { Hono, MiddlewareHandler } from 'hono';

import { createAIRequestMiddleware } from './utils.js';

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

  registerAIListLLMServicesRoute(app);

  app.get('/ai:listModels', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.modelService.listModels(
      ctx,
      context.req.query('llmService') ?? '',
      context.req.query('model') || undefined,
    );
    return context.json(result as never);
  });
  app.post('/ai:listProviderModels', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.modelService.listProviderModels(
      ctx,
      await context.req.json(),
    );
    return context.json(result as never);
  });

  app.post('/ai:testFlight', async (context) => {
    const result = unsupportedAIAction('ai:testFlight');
    return context.json(result as never);
  });
}

export function registerAIListLLMServicesCompatibilityRoute(
  app: Hono,
  ...middlewares: MiddlewareHandler[]
): void {
  for (const middleware of middlewares) {
    app.use('/ai:listLLMServices', middleware);
  }
  app.use('/ai:listLLMServices', createAIRequestMiddleware());
  registerAIListLLMServicesRoute(app);
}

function registerAIListLLMServicesRoute(app: Hono): void {
  app.get('/ai:listLLMServices', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.modelService.listLLMServices(
      ctx,
      context.req.query('model') || undefined,
    );
    return context.json(result as never);
  });
}

function unsupportedAIAction(action: string): never {
  throw new Error(`Unsupported AI action: ${action}`);
}
