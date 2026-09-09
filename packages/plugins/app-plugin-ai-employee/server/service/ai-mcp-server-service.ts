import type { AIManager } from '@nocobase/ai-employee';
import {
  asRecord,
  badRequest,
  notFound,
  optionalString,
  redactSecrets,
  requiredString,
  stringArray,
  stringRecord,
} from './utils.js';

export interface AIMCPServerServiceOptions {
  readonly ai: AIManager;
}

export class AIMCPServerService {
  private readonly ai: AIManager;

  public constructor({ ai }: AIMCPServerServiceOptions) {
    this.ai = ai;
  }
  async list(_options: {}): Promise<unknown[]> {
    return (await this.ai.mcpServerManager.listMCP({})).map(serializeMCPServer);
  }

  async get({ name }: { name: string }): Promise<unknown> {
    const server = await this.ai.mcpServerManager.getMCP(name);
    if (!server) throw notFound('aiMcpServers', name);
    return serializeMCPServer(server);
  }

  async upsert({ input }: { input: unknown }): Promise<unknown> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name, 'name');
    const current = await this.ai.mcpServerManager.getMCP(name);
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
    await this.ai.mcpServerManager.registerMCP({ [name]: values as any });
    await this.ai.mcpServerManager.rebuildClient();
    return this.get({ name });
  }

  async delete({ name }: { name: string }): Promise<void> {
    await this.ai.mcpServerManager.deleteMCP(name);
    await this.ai.mcpServerManager.rebuildClient();
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
