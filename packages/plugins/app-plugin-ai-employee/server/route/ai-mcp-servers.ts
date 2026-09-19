import type { ServiceFactory } from '../factory/service-factory.js';
import type { Hono } from 'hono';
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

  app.post('/aiMcpServers:testConnection', async (context) => {
    const result = await services.mcpServerService.testConnection({
      input: await context.req.json(),
    });
    return context.json(result as never);
  });

  app.post('/aiMcpServers:updateEnabled', async (context) => {
    await services.mcpServerService.updateEnabled({
      input: await context.req.json(),
    });
    return context.json({});
  });

  app.post('/aiMcpServers:updateToolPermission', async (context) => {
    await services.mcpServerService.updateToolPermission({
      input: await context.req.json(),
    });
    return context.json({});
  });
  app.get('/aiMcpServers:listTools', async (context) => {
    const result = await services.mcpServerService.listTools();
    return context.json(result as never);
  });
}
