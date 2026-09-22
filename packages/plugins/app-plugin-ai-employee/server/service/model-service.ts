import { SupportedModel } from '@nocobase/ai-employee';
import type { AIManager } from '@nocobase/ai-employee';
import type {
  EnabledLLMServiceDto,
  ProviderModelDto,
  ProviderModelListRequest,
} from '../types.js';
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
    // Only embedding models are suggested from the provider metadata. Chat models
    // come from the provider's own API through `listProviderModels`.
    if (model !== SupportedModel.EMBEDDING) return [];
    if (!provider.supportedModel?.includes(SupportedModel.EMBEDDING)) return [];
    return (provider.models?.[SupportedModel.EMBEDDING] ?? []).map((id) => ({
      id,
    }));
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
}
