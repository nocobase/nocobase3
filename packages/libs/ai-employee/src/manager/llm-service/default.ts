import type {
  LLMServiceEntity,
  LLMServiceRepository,
} from '../../repository/index.js';
import {
  DEFAULT_ENABLED_MODELS,
  normalizeEnabledModelsConfig,
} from './types.js';
import type {
  LLMServiceManager,
  LLMServiceOptions,
  LLMServiceQuery,
} from './types.js';

const DEFAULT_MODEL_OPTIONS: Record<string, unknown> = {
  temperature: 1,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

/**
 * Coordinates service definitions and persistence. Provider construction stays in
 * the provider manager; this class is the single owner of LLM service records.
 */
export class DefaultLLMServiceManager implements LLMServiceManager {
  private repository: LLMServiceRepository;

  constructor(repository: LLMServiceRepository) {
    this.repository = repository;
  }

  async getLLMService(name: string): Promise<LLMServiceEntity | undefined> {
    return (await this.repository.findOne({ filter: { name } })) ?? undefined;
  }

  async listLLMServices(
    query: LLMServiceQuery = {},
  ): Promise<LLMServiceEntity[]> {
    const entries = await this.repository.find({
      filter: {
        ...(query.provider ? { provider: query.provider } : {}),
        ...(query.enabled == null ? {} : { enabled: query.enabled }),
      },
      sort: ['sort', 'name'],
    });
    return query.name
      ? entries.filter((entry) => entry.name.includes(query.name!))
      : entries;
  }

  async registerLLMService(
    options: LLMServiceOptions,
    behavior: { preserveUserState?: boolean } = {},
  ): Promise<LLMServiceEntity> {
    return this.registerLLMServiceInRepository(
      this.repository,
      options,
      behavior.preserveUserState === true,
    );
  }

  async switchRepository(repository: LLMServiceRepository): Promise<void> {
    if (repository === this.repository) return;
    const services = await this.repository.find({ sort: ['sort', 'name'] });
    const targetServices = await repository.find({ sort: ['sort', 'name'] });
    const serviceNames = new Set(services.map((service) => service.name));
    for (const service of services) {
      await this.registerLLMServiceInRepository(
        repository,
        this.toLLMServiceOptions(service),
        true,
      );
    }
    for (const service of targetServices) {
      if (!serviceNames.has(service.name)) {
        await repository.destroy({ filter: { name: service.name } });
      }
    }
    this.repository = repository;
  }

  async deleteLLMService(name: string): Promise<void> {
    await this.repository.destroy({ filter: { name } });
  }

  private async registerLLMServiceInRepository(
    repository: LLMServiceRepository,
    options: LLMServiceOptions,
    preserveUserState: boolean,
  ): Promise<LLMServiceEntity> {
    const current =
      (await repository.findOne({ filter: { name: options.name } })) ??
      undefined;
    const value: LLMServiceEntity = {
      name: options.name,
      title: options.title ?? current?.title ?? options.name,
      provider: options.provider ?? current?.provider,
      options: options.options ?? current?.options ?? {},
      enabledModels:
        preserveUserState && current
          ? normalizeEnabledModelsConfig(current.enabledModels)
          : normalizeEnabledModelsConfig(
              options.enabledModels ??
                current?.enabledModels ??
                DEFAULT_ENABLED_MODELS,
            ),
      modelOptions:
        options.modelOptions ?? current?.modelOptions ?? DEFAULT_MODEL_OPTIONS,
      enabled:
        preserveUserState && current
          ? current.enabled
          : (options.enabled ?? current?.enabled ?? true),
      sort: options.sort ?? current?.sort ?? 0,
    };
    if (current) {
      await repository.update({
        filter: { name: options.name },
        values: value,
      });
      return value;
    }
    return repository.create({ values: value });
  }

  private toLLMServiceOptions(service: LLMServiceEntity): LLMServiceOptions {
    return {
      name: service.name,
      title: service.title,
      provider: service.provider,
      options: service.options,
      enabledModels: service.enabledModels,
      modelOptions: service.modelOptions,
      enabled: service.enabled,
      sort: service.sort,
    };
  }
}
