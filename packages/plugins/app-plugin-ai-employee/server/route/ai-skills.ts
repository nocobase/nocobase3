import type { ServiceFactory } from '../factory/service-factory.js';
import type { Hono } from 'hono';
import type { AISkillResourceInput } from './contracts.js';
import { requiredString } from './utils.js';
import { validationError } from '../types.js';

export function createAISkillsRouter(
  app: Hono,
  services: ServiceFactory,
): void {
  app.get('/aiSkills:listAll', async (context) => {
    const result = await services.skillService.listAll({
      actor: context.get('skillsManagementActor'),
    });
    return context.json(result);
  });

  app.get('/aiSkills:getDetails', async (context) => {
    const names = context.req.queries('name');
    if (!names || names.length !== 1) {
      throw validationError('A single name is required');
    }
    const result = await services.skillService.getDetails({
      actor: context.get('skillsManagementActor'),
      name: names[0],
    });
    return context.json(result);
  });

  app.get('/aiSkills:list', async (context) => {
    const result = await services.skillService.list({});
    return context.json(result as never);
  });

  app.get('/aiSkills:get', async (context) => {
    const result = await services.skillService.get({
      name: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(result as never);
  });

  app.post('/aiSkills:create', async (context) => {
    const result = await services.skillService.upsert({
      input: await context.req.json<AISkillResourceInput>(),
    });
    return context.json(result as never);
  });

  app.put('/aiSkills:update', async (context) => {
    const input = await context.req.json<AISkillResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const result = await services.skillService.upsert({
      input: {
        ...input,
        name: key,
      },
    });
    return context.json(result as never);
  });

  app.delete('/aiSkills:destroy', async (context) => {
    const result = await services.skillService.delete({
      name: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(result as never);
  });
}
