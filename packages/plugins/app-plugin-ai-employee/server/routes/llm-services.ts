import type { ServiceFactory } from '../service/factory.js';
import type { Hono } from 'hono';
import type { LLMServiceResourceInput } from './contracts.js';
import { requiredString } from './utils.js';

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

  app.post('/llmServices:create', async (context) => {
    const result = await services.llmService.upsert({
      input: await context.req.json<LLMServiceResourceInput>(),
    });
    return context.json(result as never);
  });

  app.put('/llmServices:update', async (context) => {
    const input = await context.req.json<LLMServiceResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const result = await services.llmService.upsert({
      input: {
        ...input,
        name: key,
      },
    });
    return context.json(result as never);
  });

  app.delete('/llmServices:destroy', async (context) => {
    const result = await services.llmService.delete({
      name: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(result as never);
  });
}
