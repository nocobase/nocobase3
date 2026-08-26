import type { LLMServiceEntity } from '../../repository/index.js';
import type { LLMServiceRepository } from '../../repository/index.js';
import type { LLMServiceOptions, LLMServiceQuery } from './types.js';
import type { LLMServiceManager } from './types.js';

/**
 * Coordinates service defaults and persistence.  Provider construction stays in
 * the provider manager; this class is the single owner of LLM service records.
 */
export class DefaultLLMServiceManager implements LLMServiceManager {
  constructor(private readonly repository: LLMServiceRepository) {}

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
  ): Promise<LLMServiceEntity> {
    const current = await this.repository.findOne({
      filter: { name: options.name },
    });
    const value: LLMServiceEntity = {
      ...current,
      ...options,
      name: options.name,
      title: options.title ?? current?.title ?? options.name,
      provider: options.provider ?? current?.provider,
      options: options.options ?? current?.options ?? {},
      enabledModels: options.enabledModels ?? current?.enabledModels ?? [],
      enabled: options.enabled ?? current?.enabled ?? true,
      sort: options.sort ?? current?.sort ?? 0,
    };
    if (current) {
      await this.repository.update({
        filter: { name: options.name },
        values: value,
      });
      return value;
    }
    return this.repository.create({ values: value });
  }

  async deleteLLMService(name: string): Promise<void> {
    await this.repository.destroy({ filter: { name } });
  }
}
