import type { ServiceFactory } from '../service/factory.js';
import type { Hono } from 'hono';
import type { AIMCPServerResourceInput } from './contracts.js';
import { requiredString } from './utils.js';

export function createAIMCPServersRouter(
  app: Hono,
  services: ServiceFactory,
): void {
  app.get('/aiMcpServers:list', async (context) => {
    const result = await services.mcpServerService.list({});
    return context.json(result as never);
  });

  app.get('/aiMcpServers:get', async (context) => {
    const result = await services.mcpServerService.get({
      name: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(result as never);
  });

  app.post('/aiMcpServers:create', async (context) => {
    const result = await services.mcpServerService.upsert({
      input: await context.req.json<AIMCPServerResourceInput>(),
    });
    return context.json(result as never);
  });

  app.put('/aiMcpServers:update', async (context) => {
    const input = await context.req.json<AIMCPServerResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const result = await services.mcpServerService.upsert({
      input: {
        ...input,
        name: key,
      },
    });
    return context.json(result as never);
  });

  app.delete('/aiMcpServers:destroy', async (context) => {
    await services.mcpServerService.delete({
      name: requiredString(context.req.query('key'), 'key'),
    });
    return context.json(null as never);
  });
}
