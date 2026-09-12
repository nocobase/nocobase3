import {
  normalizeEnabledModelsConfig,
  type LLMServiceEntity,
} from '@nocobase/ai-employee';
import type { AIManager } from '@nocobase/ai-employee';
import type {
  LLMServiceDto,
  LLMServiceResourceInput,
} from '../domain/api-contracts.js';
import {
  asRecord,
  badRequest,
  notFound,
  optionalString,
  redactSecrets,
  requiredString,
} from './utils.js';

export interface LLMServiceOptions {
  readonly ai: AIManager;
}

export class LLMService {
  private readonly ai: AIManager;

  public constructor({ ai }: LLMServiceOptions) {
    this.ai = ai;
  }
  async list(_options: {}): Promise<LLMServiceDto[]> {
    return (await this.ai.llmServiceManager.listLLMServices()).map(
      serializeLLMService,
    );
  }

  async get({ name }: { name: string }): Promise<LLMServiceDto> {
    const service = await this.ai.llmServiceManager.getLLMService(name);
    if (!service) throw notFound('llmServices', name);
    return serializeLLMService(service);
  }

  async upsert({
    input,
  }: {
    input: LLMServiceResourceInput;
  }): Promise<LLMServiceDto> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name, 'name');
    const current = await this.ai.llmServiceManager.getLLMService(name);
    if (!current && !record.provider) throw badRequest('provider is required');
    await this.ai.llmServiceManager.registerLLMService({
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
    return this.get({ name });
  }

  async delete({ name }: { name: string }): Promise<void> {
    await this.ai.llmServiceManager.deleteLLMService(name);
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
