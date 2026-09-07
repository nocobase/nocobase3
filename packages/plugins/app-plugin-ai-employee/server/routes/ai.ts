import type { ServiceFactory } from '../service/factory.js';
import type { Hono } from 'hono';

export function createAIRouter(app: Hono, services: ServiceFactory): void {
  app.get('/ai:listAllEnabledModels', async (context) => {
    const result = await services.modelService.listEnabled({});
    return context.json(result as never);
  });

  app.get('/ai:listLLMProviders', async (context) => {
    const result = await services.modelService.listLLMProviders({});
    return context.json(result as never);
  });

  app.get('/ai:listLLMServices', async (context) => {
    const result = await services.modelService.listLLMServices({
      model: context.req.query('model') || undefined,
    });
    return context.json(result as never);
  });

  app.get('/ai:listModels', async (context) => {
    const result = await services.modelService.listModels({
      llmService: context.req.query('llmService') ?? '',
      model: context.req.query('model') || undefined,
    });
    return context.json(result as never);
  });
  app.post('/ai:listProviderModels', async (context) => {
    const result = await services.modelService.listProviderModels({
      input: await context.req.json(),
    });
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
