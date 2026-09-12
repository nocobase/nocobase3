import { describe, expect, it } from 'vitest';
import { AIManager } from '../manager/index.js';
import { MemoryRepositoryFactory } from '../repository/memory/factory.js';
import { MemoryLLMServiceRepository } from '../repository/memory/llm-service.js';

function manager(): AIManager {
  return new AIManager({ repositories: new MemoryRepositoryFactory() });
}

describe('DefaultLLMServiceManager.switchRepository', () => {
  it('removes target-only services and synchronizes old services', async () => {
    const ai = manager();
    await ai.llmServiceManager.registerLLMService({
      name: 'first',
      title: 'First',
      provider: 'test',
      enabledModels: ['model-a'],
      enabled: true,
    });
    const target = new MemoryLLMServiceRepository();
    await target.create({
      values: {
        name: 'first',
        title: 'Stale first',
        provider: 'old',
        options: {},
        enabledModels: {
          mode: 'custom',
          models: [{ label: 'Database model', value: 'database-model' }],
        },
        modelOptions: {},
        enabled: false,
        sort: 0,
      },
    });
    await target.create({
      values: {
        name: 'second',
        title: 'Second',
        provider: 'old',
        options: {},
        enabledModels: [],
        modelOptions: {},
        enabled: true,
        sort: 1,
      },
    });

    await ai.llmServiceManager.switchRepository(target);

    expect(await target.findOne({ filter: { name: 'first' } })).toMatchObject({
      title: 'First',
      provider: 'test',
      enabled: false,
      enabledModels: {
        mode: 'custom',
        models: [{ label: 'Database model', value: 'database-model' }],
      },
    });
    expect(await target.findOne({ filter: { name: 'second' } })).toBeNull();
    expect(await ai.llmServiceManager.listLLMServices()).toHaveLength(1);
  });

  it('switches to an empty repository', async () => {
    const ai = manager();
    const target = new MemoryLLMServiceRepository();
    await ai.llmServiceManager.switchRepository(target);
    expect(await ai.llmServiceManager.listLLMServices()).toEqual([]);
  });
});
