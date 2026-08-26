import type { Context } from '../context.js';
import type { RuntimeActor } from '@nocobase/ai-employee';
import type { AIEmployeeAccessPolicy } from '../auth/access-policy.js';
import {
  asRecord,
  assertCanManage,
  badRequest,
  notFound,
  optionalString,
  redactSecrets,
  requiredString,
  stringArray,
  stringRecord,
  unwrapRecord,
} from './resource-management-utils.js';

export class AIMCPServerService {
  constructor(private readonly accessPolicy: AIEmployeeAccessPolicy) {}

  async list(ctx: Context, actor: RuntimeActor): Promise<unknown[]> {
    assertCanManage(this.accessPolicy, actor);
    return (await ctx.ai.mcpServerManager.listMCP({})).map(serializeMCPServer);
  }

  async get(ctx: Context, actor: RuntimeActor, name: string): Promise<unknown> {
    assertCanManage(this.accessPolicy, actor);
    const server = await ctx.ai.mcpServerManager.getMCP(name);
    if (!server) throw notFound('aiMcpServers', name);
    return serializeMCPServer(server);
  }

  async upsert(
    ctx: Context,
    actor: RuntimeActor,
    input: unknown,
    keyHint?: string,
  ): Promise<unknown> {
    assertCanManage(this.accessPolicy, actor);
    const record = unwrapRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name ?? keyHint, 'name');
    const current = await ctx.ai.mcpServerManager.getMCP(name);
    const currentRecord = asRecord(current) ?? {};
    const transport = record.transport ?? current?.transport;
    if (transport !== 'stdio' && transport !== 'sse' && transport !== 'http') {
      throw badRequest('transport must be stdio, sse, or http');
    }
    const values = {
      name,
      title: optionalString(record.title) ?? currentRecord.title,
      description:
        optionalString(record.description) ?? currentRecord.description,
      enabled:
        typeof record.enabled === 'boolean'
          ? record.enabled
          : (current?.enabled ?? true),
      transport,
      command: optionalString(record.command) ?? current?.command,
      args: stringArray(record.args) ?? current?.args ?? [],
      env: stringRecord(record.env) ?? current?.env ?? {},
      url: optionalString(record.url) ?? current?.url,
      headers: stringRecord(record.headers) ?? current?.headers ?? {},
      restart: asRecord(record.restart) ?? current?.restart,
    };
    await ctx.ai.mcpServerManager.registerMCP({ [name]: values as any });
    await ctx.ai.mcpServerManager.rebuildClient();
    return this.get(ctx, actor, name);
  }

  async delete(ctx: Context, actor: RuntimeActor, name: string): Promise<void> {
    assertCanManage(this.accessPolicy, actor);
    await ctx.ai.mcpServerManager.deleteMCP(name);
    await ctx.ai.mcpServerManager.rebuildClient();
  }
}

function serializeMCPServer(value: unknown): unknown {
  const record = asRecord(value);
  return record
    ? {
        ...record,
        env: redactSecrets(record.env),
        headers: redactSecrets(record.headers),
      }
    : value;
}
