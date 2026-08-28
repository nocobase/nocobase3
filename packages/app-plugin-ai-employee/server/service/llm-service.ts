import type { Context } from '../context.js';
import {
  asRecord,
  badRequest,
  notFound,
  optionalString,
  redactSecrets,
  requiredString,
} from './utils.js';

export class LLMService {
  async list(ctx: Context): Promise<unknown[]> {
    return (await ctx.ai.llmServiceManager.listLLMServices({})).map(
      serializeLLMService,
    );
  }

  async get(ctx: Context, name: string): Promise<unknown> {
    const service = await ctx.ai.llmServiceManager.getLLMService(name);
    if (!service) throw notFound('llmServices', name);
    return serializeLLMService(service);
  }

  async upsert(ctx: Context, input: unknown): Promise<unknown> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name, 'name');
    const current = await ctx.ai.llmServiceManager.getLLMService(name);
    const provider = requiredString(
      record.provider ?? current?.provider,
      'provider',
    );
    await ctx.ai.llmServiceManager.registerLLMService({
      ...current,
      name,
      title: optionalString(record.title) ?? current?.title ?? name,
      provider,
      options: asRecord(record.options) ?? current?.options ?? {},
      enabledModels: record.enabledModels ?? current?.enabledModels ?? [],
      enabled:
        typeof record.enabled === 'boolean'
          ? record.enabled
          : (current?.enabled ?? true),
      modelOptions: asRecord(record.modelOptions) ?? current?.modelOptions,
      sort: typeof record.sort === 'number' ? record.sort : current?.sort,
    } as any);
    return this.get(ctx, name);
  }

  async delete(ctx: Context, name: string): Promise<void> {
    await ctx.ai.llmServiceManager.deleteLLMService(name);
  }
}

function serializeLLMService(value: unknown): unknown {
  const record = asRecord(value);
  return record ? { ...record, options: redactSecrets(record.options) } : value;
}
