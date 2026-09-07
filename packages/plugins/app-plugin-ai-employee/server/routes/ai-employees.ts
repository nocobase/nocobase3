import type { ServiceFactory } from '../service/factory.js';
import type { Hono } from 'hono';
import type {
  AIEmployeeResourceInput,
  AIUserPromptUpdateInput,
} from './contracts.js';
import { requiredString } from './utils.js';

export function createAIEmployeeRouter(
  app: Hono,
  services: ServiceFactory,
): void {
  app.get('/aiEmployees:listByUser', async (context) => {
    const result = await services.employeeService.listByUser({
      actor: context.var.currentUser,
      translate: (key) => key,
    });
    return context.json(result as never);
  });

  app.post('/aiEmployees:updateUserPrompt', async (context) => {
    const input = await context.req.json<AIUserPromptUpdateInput>();
    await services.employeeService.updateUserPrompt({
      actorId: context.var.currentUser.id,
      employeeKey: requiredString(input.aiEmployee, 'aiEmployee'),
      prompt: typeof input.prompt === 'string' ? input.prompt : '',
    });
    const result = null;
    return context.json(result as never);
  });

  app.get('/aiEmployees:getTemplates', async (context) => {
    const result = await services.employeeService.getTemplates({});
    return context.json(result as never);
  });

  app.get('/aiEmployees:list', async (context) => {
    const result = await services.employeeService.list({
      translate: (key) => key,
    });
    return context.json(result as never);
  });

  app.get('/aiEmployees:get', async (context) => {
    const result = await services.employeeService.get({
      username: requiredString(context.req.query('key'), 'key'),
      translate: (key) => key,
    });
    return context.json(result as never);
  });

  app.post('/aiEmployees:create', async (context) => {
    const result = await services.employeeService.upsert({
      input: await context.req.json<AIEmployeeResourceInput>(),
      translate: (key) => key,
    });
    return context.json(result as never);
  });

  app.put('/aiEmployees:update', async (context) => {
    const input = await context.req.json<AIEmployeeResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const result = await services.employeeService.upsert({
      input: {
        ...input,
        username: key,
      },
      translate: (key) => key,
    });
    return context.json(result as never);
  });

  app.delete('/aiEmployees:destroy', async (context) => {
    const result = await services.employeeService.delete({
      username: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(result as never);
  });
}
