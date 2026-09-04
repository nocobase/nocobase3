import type { ServiceFactory } from '../service/factory.js';
import type { Hono } from 'hono';
import type { AIToolResourceInput } from './contracts.js';
import { requiredString } from './utils.js';

export function createAIToolsRouter(app: Hono, services: ServiceFactory): void {
  app.get('/aiTools:list', async (context) => {
    const result = await services.toolService.list({});
    return context.json(result as never);
  });

  app.get('/aiTools:get', async (context) => {
    const result = await services.toolService.get({
      name: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(result as never);
  });

  app.post('/aiTools:create', async (context) => {
    const result = await services.toolService.upsert({
      input: await context.req.json<AIToolResourceInput>(),
    });
    return context.json(result as never);
  });

  app.put('/aiTools:update', async (context) => {
    const input = await context.req.json<AIToolResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const definition =
      input.definition &&
      typeof input.definition === 'object' &&
      !Array.isArray(input.definition)
        ? input.definition
        : {};
    const result = await services.toolService.upsert({
      input: {
        ...input,
        definition: { ...definition, name: key },
      },
    });
    return context.json(result as never);
  });

  app.delete('/aiTools:destroy', async (context) => {
    const result = await services.toolService.delete({
      name: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(result as never);
  });
}
