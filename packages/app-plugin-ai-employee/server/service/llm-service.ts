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
  unwrapRecord,
} from './resource-management-utils.js';

export class LLMService {
  constructor(private readonly accessPolicy: AIEmployeeAccessPolicy) {}

  async list(ctx: Context, actor: RuntimeActor): Promise<unknown[]> {
    assertCanManage(this.accessPolicy, actor);
    return (await ctx.ai.llmServiceManager.listLLMServices({})).map(
      serializeLLMService,
    );
  }

  async get(ctx: Context, actor: RuntimeActor, name: string): Promise<unknown> {
    assertCanManage(this.accessPolicy, actor);
    const service = await ctx.ai.llmServiceManager.getLLMService(name);
    if (!service) throw notFound('llmServices', name);
    return serializeLLMService(service);
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
    return this.get(ctx, actor, name);
  }

  async delete(ctx: Context, actor: RuntimeActor, name: string): Promise<void> {
    assertCanManage(this.accessPolicy, actor);
    await ctx.ai.llmServiceManager.deleteLLMService(name);
  }
}

function serializeLLMService(value: unknown): unknown {
  const record = asRecord(value);
  return record ? { ...record, options: redactSecrets(record.options) } : value;
}
