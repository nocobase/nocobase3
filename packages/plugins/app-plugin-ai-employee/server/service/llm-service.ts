import {
  normalizeEnabledModelsConfig,
  type LLMServiceEntity,
  type LLMServiceOptions as LLMServiceRegistration,
} from '@nocobase/ai-employee';
import type { AIManager } from '@nocobase/ai-employee';
import type { LLMServiceDto } from '../types.js';
import {
  asRecord,
  badRequest,
  notFound,
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

  async updateEnabled({ input }: { input: unknown }): Promise<LLMServiceDto> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name, 'name');
    if (typeof record.enabled !== 'boolean')
      throw badRequest('enabled must be a boolean');
    return this.patch(name, { enabled: record.enabled });
  }

  async updateEnabledModels({
    input,
  }: {
    input: unknown;
  }): Promise<LLMServiceDto> {
    const record = asRecord(input);
    if (!record) throw badRequest('Resource body must be an object');
    const name = requiredString(record.name, 'name');
    const enabledModels = asRecord(record.enabledModels);
    if (
      !enabledModels ||
      (enabledModels.mode !== 'provider' && enabledModels.mode !== 'custom') ||
      !Array.isArray(enabledModels.models)
    ) {
      throw badRequest(
        'enabledModels must be { mode: "provider" | "custom", models: [] }',
      );
    }
    return this.patch(name, {
      enabledModels: normalizeEnabledModelsConfig(enabledModels),
    });
  }

  // Changes one field of a configured service and keeps the rest as stored.
  private async patch(
    name: string,
    values: Pick<LLMServiceRegistration, 'enabled' | 'enabledModels'>,
  ): Promise<LLMServiceDto> {
    const current = await this.ai.llmServiceManager.getLLMService(name);
    if (!current) throw notFound('llmServices', name);
    await this.ai.llmServiceManager.registerLLMService({
      name,
      provider: current.provider,
      ...values,
    });
    return this.get({ name });
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
