import { SupportedModel } from '@nocobase/ai-employee';
import type { AIManager } from '@nocobase/ai-employee';
import { randomUUID } from 'node:crypto';
import type {
  EnabledLLMServiceDto,
  ProviderModelDto,
  ProviderModelListRequest,
} from '../domain/api-contracts.js';
import { badRequest, notFound, requiredString } from './utils.js';

/**
 * LLM service / model service — uses the provider manager and shared in-memory `llmServices` store.
 */
export interface ModelServiceOptions {
  readonly ai: AIManager;
}

export class ModelService {
  private readonly ai: AIManager;

  public constructor({ ai }: ModelServiceOptions) {
    this.ai = ai;
  }
  async listEnabled(_options: {}): Promise<EnabledLLMServiceDto[]> {
    const list = await this.ai.llmProviderManager.listAllEnabledModels();
    return list.map((service) => ({
      llmService: service.llmService,
      llmServiceTitle: service.llmServiceTitle,
      provider: service.provider,
      providerTitle: service.providerTitle,
      enabledModels: service.enabledModels,
      supportWebSearch: service.supportWebSearch,
      webSearchModels: service.webSearchModels,
      isToolConflict: service.isToolConflict,
    }));
  }

  listLLMProviders(_options: {}): ReturnType<
    AIManager['llmProviderManager']['listLLMProviders']
  > {
    return this.ai.llmProviderManager.listLLMProviders();
  }

  async listLLMServices({
    model,
  }: {
    model?: string;
  }): Promise<Array<{ name: string; title: string; provider: string }>> {
    const supportedProviders = model
      ? new Set(
          this.ai.llmProviderManager.getSupportedProvider(
            model as SupportedModel,
          ),
        )
      : undefined;
    if (supportedProviders && !supportedProviders.size) return [];
    const services = await this.ai.llmServiceManager.listLLMServices({
      enabled: true,
    });
    return services
      .filter(
        (service) =>
          !supportedProviders || supportedProviders.has(service.provider),
      )
      .map(({ name, title, provider }) => ({ name, title, provider }));
  }

  async listModels({
    llmService,
    model,
  }: {
    llmService: string;
    model?: string;
  }): Promise<Array<{ id: string }>> {
    const service = await this.ai.llmServiceManager.getLLMService(llmService);
    if (!service || service.enabled === false) return [];
    const provider = this.ai.llmProviderManager.llmProviders.get(
      service.provider,
    );
    if (!provider) return [];
    if (model) {
      const type = model as SupportedModel;
      if (!provider.supportedModel?.includes(type)) return [];
      return (provider.models?.[type] ?? []).map((id) => ({ id }));
    }
    return [];
  }
  async listProviderModels({
    input,
  }: {
    input: ProviderModelListRequest;
  }): Promise<ProviderModelDto[]> {
    const llmService = requiredString(input.llmService, 'llmService');
    const service = await this.ai.llmServiceManager.getLLMService(llmService);
    if (!service) throw notFound('llmServices', llmService);
    const providerMeta = this.ai.llmProviderManager.llmProviders.get(
      service.provider,
    );
    if (!providerMeta) {
      throw badRequest(`LLM provider not found: ${service.provider}`);
    }
    const Provider = providerMeta.provider;
    const provider = new Provider({ serviceOptions: service.options });
    let result: Awaited<ReturnType<typeof provider.listModels>>;
    try {
      result = await provider.listModels();
    } catch (error) {
      throw new Error(
        `Failed to load models for LLM service "${llmService}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (result.errMsg) {
      const error: Error & { status?: number } = new Error(
        `Failed to load models for LLM service "${llmService}": ${result.errMsg}`,
      );
      error.status = result.code || 500;
      throw error;
    }
    const search = input.search?.trim().toLowerCase();
    const seen = new Set<string>();
    return (result.models ?? []).flatMap((model) => {
      const id = typeof model?.id === 'string' ? model.id.trim() : '';
      if (
        !id ||
        seen.has(id) ||
        (search && !id.toLowerCase().includes(search))
      ) {
        return [];
      }
      seen.add(id);
      return [{ id }];
    });
  }

  async getSupportedProvider({ model }: { model: string }): Promise<string[]> {
    return this.ai.llmProviderManager.getSupportedProvider(model as any);
  }

  async requireModel({
    model,
  }: {
    model: { llmService: string; model: string };
  }): Promise<{ llmService: string; provider: string }> {
    const service = await this.ai.llmServiceManager.getLLMService(
      model.llmService,
    );
    if (!service || service.enabled === false) {
      throw new Error(`LLM service not found or disabled: ${model.llmService}`);
    }
    const providerMeta = this.ai.llmProviderManager.llmProviders.get(
      service.provider,
    );
    if (!providerMeta) {
      throw new Error(`LLM provider is not configured: ${service.provider}`);
    }
    const { getRecommendedModels } = await import('@nocobase/ai-employee');
    const enabledModels = service.enabledModels ?? [];
    const models =
      enabledModels &&
      typeof enabledModels === 'object' &&
      !Array.isArray(enabledModels)
        ? ((enabledModels as { models?: Array<{ value?: string }> }).models ??
          [])
        : Array.isArray(enabledModels)
          ? enabledModels.map((id: string) => ({ value: id }))
          : getRecommendedModels(service.provider);
    if (
      !models.some(
        (candidate: { value?: string }) => candidate?.value === model.model,
      )
    ) {
      throw new Error(
        `Model is not enabled: ${model.llmService}/${model.model}`,
      );
    }
    return { llmService: model.llmService, provider: service.provider };
  }

  randomUuid(_options: {}): string {
    return randomUUID();
  }
}
