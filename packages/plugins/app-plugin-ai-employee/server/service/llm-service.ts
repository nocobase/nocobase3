import {
  normalizeEnabledModelsConfig,
  type LLMServiceEntity,
} from '@nocobase/ai-employee';
import type { Context } from '../context.js';
import type {
  LLMServiceDto,
  LLMServiceResourceInput,
} from '../routes/contracts.js';
import {
  asRecord,
  badRequest,
  notFound,
  optionalString,
  redactSecrets,
  requiredString,
} from './utils.js';

export class LLMService {
  async list(ctx: Context): Promise<LLMServiceDto[]> {
    return (await ctx.ai.llmServiceManager.listLLMServices()).map(
      serializeLLMService,
    );
  }

  async get(ctx: Context, name: string): Promise<LLMServiceDto> {
    const service = await ctx.ai.llmServiceManager.getLLMService(name);
    if (!service) throw notFound('llmServices', name);
    return serializeLLMService(service);
  }

  async upsert(
    ctx: Context,
    input: LLMServiceResourceInput,
  ): Promise<LLMServiceDto> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name, 'name');
    const current = await ctx.ai.llmServiceManager.getLLMService(name);
    if (!current && !record.provider) throw badRequest('provider is required');
    await ctx.ai.llmServiceManager.registerLLMService({
      name,
      title: optionalString(record.title) ?? current?.title ?? name,
      provider: optionalString(record.provider) ?? current?.provider ?? '',
      options: asRecord(record.options) ?? current?.options ?? {},
      enabledModels: record.enabledModels ?? current?.enabledModels ?? null,
      enabled:
        typeof record.enabled === 'boolean' ? record.enabled : current?.enabled,
      modelOptions: asRecord(record.modelOptions) ?? current?.modelOptions,
      sort: typeof record.sort === 'number' ? record.sort : current?.sort,
    });
    return this.get(ctx, name);
  }

  async delete(ctx: Context, name: string): Promise<void> {
    await ctx.ai.llmServiceManager.deleteLLMService(name);
  }
}

function serializeLLMService(value: LLMServiceEntity): LLMServiceDto {
  return {
    name: value.name,
    title: value.title,
    provider: value.provider,
    options: redactSecrets(value.options) as Record<string, unknown>,
    enabledModels: normalizeEnabledModelsConfig(value.enabledModels),
    enabled: value.enabled,
    modelOptions: value.modelOptions,
    sort: value.sort,
  };
}
