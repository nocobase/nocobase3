import type { Context } from '../context.js';
import { randomUUID } from 'node:crypto';
import type { EnabledLLMServiceDto } from '../routes/contracts.js';

/**
 * LLM service / model service — uses the provider manager and shared in-memory `llmServices` store.
 */
export class ModelService {
  async listEnabled(ctx: Context): Promise<EnabledLLMServiceDto[]> {
    const list = await ctx.ai.llmProviderManager.listAllEnabledModels();
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

  async listLLMProviders(ctx: Context): Promise<unknown[]> {
    return ctx.ai.llmProviderManager.listLLMProviders();
  }

  async getSupportedProvider(ctx: Context, model: string): Promise<string[]> {
    return ctx.ai.llmProviderManager.getSupportedProvider(model as any);
  }

  async requireModel(
    ctx: Context,
    model: { llmService: string; model: string },
  ): Promise<{ llmService: string; provider: string }> {
    const service = await ctx.ai.llmServiceManager.getLLMService(
      model.llmService,
    );
    if (!service || service.enabled === false) {
      throw new Error(`LLM service not found or disabled: ${model.llmService}`);
    }
    const providerMeta = ctx.ai.llmProviderManager.llmProviders.get(
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

  randomUuid(_ctx: Context): string {
    return randomUUID();
  }
}
