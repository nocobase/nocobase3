import type { LLMServiceEntity } from '../../repository/index.js';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Team.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { LLMServiceRepository } from '../../repository/index.js';

import { getRecommendedModels } from './recommended-models.js';
import type {
  EnabledLLMModel,
  EnabledLLMService,
  LLMModelOptions,
  LLMProviderMeta,
} from './types.js';
import { SupportedModel } from './types.js';

/**
 * LLM provider registry and provider factory. Service records are injected via
 * LLMServiceRepository rather than being read from a plugin database.
 */
export class LLMProviderManager {
  llmProviders = new Map<string, LLMProviderMeta>();

  constructor(private readonly llmServiceRepository: LLMServiceRepository) {}

  registerLLMProvider(name: string, meta: LLMProviderMeta): void {
    this.llmProviders.set(name, meta);
  }

  listLLMProviders() {
    return Array.from(this.llmProviders.entries()).map(
      ([
        name,
        { title, supportedModel, supportWebSearch, webSearchModels },
      ]) => ({
        name,
        title,
        supportedModel: supportedModel ?? [SupportedModel.LLM],
        supportWebSearch: supportWebSearch ?? false,
        webSearchModels,
      }),
    );
  }

  getSupportedProvider(model: SupportedModel): string[] {
    return Array.from(this.llmProviders.entries())
      .filter(
        ([, { supportedModel }]) =>
          supportedModel && supportedModel.includes(model),
      )
      .map(([name]) => name);
  }

  async listAllEnabledModels(): Promise<EnabledLLMService[]> {
    const services = await this.llmServiceRepository.find({
      sort: ['sort', 'name'],
    });
    return services
      .filter((service) => service.enabled !== false)
      .map((service) => this.toEnabledLLMService(service))
      .filter((service): service is EnabledLLMService => Boolean(service));
  }

  async resolveModel(model?: LLMModelOptions | null): Promise<LLMModelOptions> {
    if (model?.llmService && model?.model) return model;

    const services = await this.listAllEnabledModels();
    const service = services.find((item) => item.enabledModels.length);
    const firstModel = service?.enabledModels[0]?.value;
    if (service?.llmService && firstModel)
      return { llmService: service.llmService, model: firstModel };
    throw new Error('LLM service not configured');
  }

  private toEnabledLLMService(
    service: LLMServiceEntity,
  ): EnabledLLMService | null {
    const provider = service.provider;
    const providerMeta = this.llmProviders.get(provider);
    if (!providerMeta) return null;

    const enabledModels = this.getEnabledModels(service);
    if (!enabledModels.length) return null;

    const Provider = providerMeta.provider;
    const providerClient = new Provider({});
    return {
      llmService: service.name,
      llmServiceTitle: service.title,
      provider,
      providerTitle: providerMeta.title,
      enabledModels,
      supportWebSearch: providerMeta.supportWebSearch ?? false,
      webSearchModels: providerMeta.webSearchModels,
      isToolConflict: providerClient.isToolConflict(),
    };
  }

  private getEnabledModels(service: LLMServiceEntity): EnabledLLMModel[] {
    const provider = service.provider;
    const raw = service.enabledModels;
    if (
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      (raw as any).mode
    ) {
      if ((raw as any).mode === 'recommended')
        return getRecommendedModels(provider);
      return ((raw as any).models || [])
        .filter((model: { value: string }) => model.value)
        .map((model: { label?: string; value: string }) => ({
          label: model.label || model.value,
          value: model.value,
        }));
    }
    if (Array.isArray(raw)) {
      if (!raw.length) return getRecommendedModels(provider);
      return raw.map((id: string) => ({ label: id, value: id }));
    }
    return getRecommendedModels(provider);
  }

  async createEmbedding(
    options: LLMModelOptions,
  ): Promise<import('@langchain/core/embeddings').EmbeddingsInterface> {
    const { llmService, model } = options;
    if (!llmService || !model)
      throw new Error('Embedding service and model are required');
    const service = await this.llmServiceRepository.findOne({
      filter: { name: llmService },
    });
    if (!service) throw new Error(`LLM service "${llmService}" not found`);
    const providerOptions = this.llmProviders.get(service.provider);
    if (!providerOptions)
      throw new Error(`LLM provider "${service.provider}" not found`);
    if (!providerOptions.embedding) {
      throw new Error(
        `LLM provider "${service.provider}" does not support embeddings`,
      );
    }
    return new providerOptions.embedding({
      serviceOptions: service.options,
      modelOptions: { model },
    }).createEmbedding();
  }

  async getLLMService(options: LLMModelOptions) {
    const { llmService, model, webSearch, reasoning } = options ?? {};
    if (!llmService || !model) throw new Error('LLM service not configured');

    const modelOptions: Record<string, any> = { llmService, model };
    if (webSearch === true) modelOptions.builtIn = { webSearch: true };
    if (reasoning) modelOptions._reasoning = reasoning;

    const service = await this.llmServiceRepository.findOne({
      filter: { name: llmService },
    });
    if (!service) throw new Error('LLM service not found');

    const providerOptions = this.llmProviders.get(service.provider);
    if (!providerOptions) throw new Error('LLM service provider not found');
    if (
      webSearch === true &&
      providerOptions.webSearchModels &&
      !providerOptions.webSearchModels.includes(model)
    ) {
      throw new Error(`Web search is not supported by model "${model}"`);
    }

    const Provider = providerOptions.provider;
    const provider = new Provider({
      serviceOptions: service.options,
      modelOptions,
    });
    return { provider, model, service };
  }
}
