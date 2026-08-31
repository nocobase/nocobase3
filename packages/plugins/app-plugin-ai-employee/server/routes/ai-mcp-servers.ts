import type { Hono } from 'hono';
import type { AIMCPServerResourceInput } from './contracts.js';
import { requiredString } from './utils.js';

export function createAIMCPServersRouter(app: Hono): void {
  app.get('/aiMcpServers:list', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.mcpServerService.list(ctx);
    return context.json(result as never);
  });

  app.get('/aiMcpServers:get', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.mcpServerService.get(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(result as never);
  });

  app.post('/aiMcpServers:create', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.mcpServerService.upsert(
      ctx,
      await context.req.json<AIMCPServerResourceInput>(),
    );
    return context.json(result as never);
  });

  app.put('/aiMcpServers:update', async (context) => {
    const ctx = context.var.ctx;
    const input = await context.req.json<AIMCPServerResourceInput>();
    const key = requiredString(context.req.query('key'), 'key');
    const result = await ctx.mcpServerService.upsert(ctx, {
      ...input,
      name: key,
    });
    return context.json(result as never);
  });

  app.delete('/aiMcpServers:destroy', async (context) => {
    const ctx = context.var.ctx;
    await ctx.mcpServerService.delete(
      ctx,
      requiredString(context.req.query('key'), 'key'),
    );
    return context.json(null as never);
  });
}
