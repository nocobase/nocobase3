import type { ServiceFactory } from '../factory/service-factory.js';
import type { Hono } from 'hono';
import type { AIToolResourceInput } from './contracts.js';
import { requiredString } from './utils.js';
import { validationError } from '../types.js';

export function createAIToolsRouter(app: Hono, services: ServiceFactory): void {
  app.get('/aiTools:listAll', async (context) => {
    const result = await services.toolService.listAll({
      actor: context.get('toolsManagementActor'),
    });
    return context.json(result);
  });

  app.get('/aiTools:getDetails', async (context) => {
    const names = context.req.queries('name');
    if (!names || names.length !== 1) {
      throw validationError('A single name is required');
    }
    const result = await services.toolService.getDetails({
      actor: context.get('toolsManagementActor'),
      name: names[0],
    });
    return context.json(result);
  });

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
