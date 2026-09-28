import type { ServiceFactory } from '../factory/service-factory.js';
import type { Hono } from 'hono';
import { requiredString } from './utils.js';

// LLM services are defined in config.yml `ai.llmServices`. The settings page
// may only switch a service on or off and choose its models.
export function createLLMServicesRouter(
  app: Hono,
  services: ServiceFactory,
): void {
  app.get('/llmServices:list', async (context) => {
    const result = await services.llmService.list({});
    return context.json(result as never);
  });

  app.get('/llmServices:get', async (context) => {
    const result = await services.llmService.get({
      name: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(result as never);
  });

  app.post('/llmServices:updateEnabled', async (context) => {
    const result = await services.llmService.updateEnabled({
      input: await context.req.json(),
    });
    return context.json(result as never);
  });

  app.post('/llmServices:updateEnabledModels', async (context) => {
    const result = await services.llmService.updateEnabledModels({
      input: await context.req.json(),
    });
    return context.json(result as never);
  });
}
